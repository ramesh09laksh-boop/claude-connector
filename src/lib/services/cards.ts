import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { team, user } from "@/lib/db/auth-schema";
import { logActivity } from "@/lib/activity";
import { getAssignableMembers, getBoardState, type BoardState } from "@/lib/boards";
import type { Actor } from "@/lib/actor";
import {
  NotFoundError,
  requireCardAccess,
  requireColumnAccess,
} from "@/lib/board-guards";
import { visibleTeamIds } from "./workspace";

/**
 * Card reads and writes, taking an explicit `Actor`.
 *
 * The server actions in `lib/actions/cards.ts` and the MCP tools both call these
 * — the guard chain and the ordering rules live here once. Plain server-only
 * module, never `"use server"`: an exported function that takes the actor from
 * its caller must not also be an HTTP endpoint.
 */

const CARD_PERMISSIONS = {
  create: { card: ["create"] },
  update: { card: ["update"] },
  delete: { card: ["delete"] },
} as const;

const uuidish = z.string().uuid();

const createCardSchema = z.object({
  columnId: uuidish,
  title: z.string().trim().min(1, "Give the card a title.").max(200),
});

const updateCardSchema = z.object({
  cardId: uuidish,
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const moveCardSchema = z.object({
  cardId: uuidish,
  toColumnId: uuidish,
  toIndex: z.number().int().min(0),
});

/** Renumber a column densely, 0..n-1, from whatever order it is in now. */
async function renumberColumn(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  columnId: string,
) {
  const rows = await tx
    .select({ id: card.id })
    .from(card)
    .where(eq(card.columnId, columnId))
    .orderBy(asc(card.position), asc(card.createdAt));

  for (let i = 0; i < rows.length; i++) {
    await tx.update(card).set({ position: i }).where(eq(card.id, rows[i].id));
  }
}

export async function createCardFor(
  actor: Actor,
  input: { columnId: string; title: string },
): Promise<BoardState | null> {
  const parsed = createCardSchema.parse(input);
  const access = await requireColumnAccess(
    actor,
    parsed.columnId,
    CARD_PERMISSIONS.create,
  );

  await db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(card)
      .where(eq(card.columnId, parsed.columnId));

    await tx.insert(card).values({
      columnId: parsed.columnId,
      title: parsed.title,
      position: n,
      createdById: actor.userId,
    });
  });

  await logActivity(
    "card.created",
    { teamId: access.team.id, columnId: parsed.columnId, title: parsed.title },
    actor.userId,
  );

  revalidatePath(`/teams/${access.team.id}`);
  return getBoardState(access.team.id);
}

export async function updateCardFor(
  actor: Actor,
  input: {
    cardId: string;
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<BoardState | null> {
  const parsed = updateCardSchema.parse(input);
  const access = await requireCardAccess(actor, parsed.cardId, CARD_PERMISSIONS.update);

  // An assignee must be someone who can already see this board. Accepting any
  // user id lets someone assign a card to a stranger and leaks that person's
  // name onto the board.
  if (parsed.assigneeId) {
    const assignable = await getAssignableMembers(access.team.id);
    if (!assignable.some((m) => m.id === parsed.assigneeId)) {
      throw new NotFoundError("That person isn't on this team.");
    }
  }

  const changed: string[] = [];
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.title !== undefined) {
    values.title = parsed.title;
    changed.push("title");
  }
  if (parsed.description !== undefined) {
    values.description = parsed.description;
    changed.push("description");
  }
  if (parsed.assigneeId !== undefined) {
    values.assigneeId = parsed.assigneeId;
    changed.push("assignee");
  }
  if (parsed.dueDate !== undefined) {
    values.dueDate = parsed.dueDate ? new Date(parsed.dueDate) : null;
    changed.push("dueDate");
  }

  await db.update(card).set(values).where(eq(card.id, parsed.cardId));

  await logActivity(
    "card.updated",
    { teamId: access.team.id, cardId: parsed.cardId, fields: changed },
    actor.userId,
  );

  revalidatePath(`/teams/${access.team.id}`);
  return getBoardState(access.team.id);
}

export async function deleteCardFor(
  actor: Actor,
  input: { cardId: string },
): Promise<BoardState | null> {
  const parsed = z.object({ cardId: uuidish }).parse(input);
  const access = await requireCardAccess(actor, parsed.cardId, CARD_PERMISSIONS.delete);
  const sourceColumnId = access.card.columnId;

  await db.transaction(async (tx) => {
    await tx.delete(card).where(eq(card.id, parsed.cardId));
    await renumberColumn(tx, sourceColumnId);
  });

  await logActivity(
    "card.deleted",
    { teamId: access.team.id, cardId: parsed.cardId, title: access.card.title },
    actor.userId,
  );

  revalidatePath(`/teams/${access.team.id}`);
  return getBoardState(access.team.id);
}

/**
 * The one to get right.
 *
 * `toColumnId` is the cross-tenant hole in this feature: a valid card id of
 * yours plus a column id from another organisation would move your card into
 * their board. The same-board assertion below is what closes it.
 */
export async function moveCardFor(
  actor: Actor,
  input: { cardId: string; toColumnId: string; toIndex: number },
): Promise<BoardState | null> {
  const parsed = moveCardSchema.parse(input);
  const access = await requireCardAccess(actor, parsed.cardId, CARD_PERMISSIONS.update);

  const [destination] = await db
    .select({ id: boardColumn.id, boardId: boardColumn.boardId, name: boardColumn.name })
    .from(boardColumn)
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .where(eq(boardColumn.id, parsed.toColumnId))
    .limit(1);

  if (!destination || destination.boardId !== access.card.boardId) {
    throw new NotFoundError("That column isn't on this board.");
  }

  const fromColumnId = access.card.columnId;

  await db.transaction(async (tx) => {
    // Take the card out of its column and renumber what's left.
    await tx
      .update(card)
      .set({ position: -1, columnId: parsed.toColumnId, updatedAt: new Date() })
      .where(eq(card.id, parsed.cardId));

    if (fromColumnId !== parsed.toColumnId) {
      await renumberColumn(tx, fromColumnId);
    }

    // Rebuild the destination in the order it should end up in.
    const others = await tx
      .select({ id: card.id })
      .from(card)
      .where(and(eq(card.columnId, parsed.toColumnId), sql`${card.id} <> ${parsed.cardId}`))
      .orderBy(asc(card.position), asc(card.createdAt));

    const clamped = Math.min(Math.max(parsed.toIndex, 0), others.length);
    const ordered = [
      ...others.slice(0, clamped).map((r) => r.id),
      parsed.cardId,
      ...others.slice(clamped).map((r) => r.id),
    ];

    for (let i = 0; i < ordered.length; i++) {
      await tx.update(card).set({ position: i }).where(eq(card.id, ordered[i]));
    }
  });

  await logActivity(
    "card.moved",
    {
      teamId: access.team.id,
      cardId: parsed.cardId,
      title: access.card.title,
      from: fromColumnId,
      to: parsed.toColumnId,
    },
    actor.userId,
  );

  revalidatePath(`/teams/${access.team.id}`);
  return getBoardState(access.team.id);
}

export type CardDetail = {
  cardId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  position: number;
  assignee: { userId: string; name: string; email: string } | null;
  columnId: string;
  columnName: string;
  boardId: string;
  boardName: string;
  teamId: string;
  teamName: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * One card in full, with the column, board and team it belongs to.
 *
 * `requireCardAccess` with the read permission every role holds: this is the
 * guard that turns another organisation's card id into a not-found rather than
 * a leak. Reading takes `card: ["create"]` — the weakest card statement, held by
 * Member, Admin and Owner alike — because there is no read statement to ask for
 * and every role that can see a board can see its cards.
 */
export async function getCardFor(
  actor: Actor,
  input: { cardId: string },
): Promise<CardDetail> {
  const parsed = z.object({ cardId: uuidish }).parse(input);
  await requireCardAccess(actor, parsed.cardId, CARD_PERMISSIONS.create);

  const [row] = await db
    .select({
      id: card.id,
      title: card.title,
      description: card.description,
      dueDate: card.dueDate,
      position: card.position,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      columnId: boardColumn.id,
      columnName: boardColumn.name,
      boardId: board.id,
      boardName: board.name,
      teamId: team.id,
      teamName: team.name,
      assigneeId: user.id,
      assigneeName: user.name,
      assigneeEmail: user.email,
    })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .innerJoin(team, eq(team.id, board.teamId))
    .leftJoin(user, eq(user.id, card.assigneeId))
    .where(eq(card.id, parsed.cardId))
    .limit(1);

  if (!row) throw new NotFoundError();

  return {
    cardId: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    position: row.position,
    assignee: row.assigneeId
      ? {
          userId: row.assigneeId,
          name: row.assigneeName ?? "",
          email: row.assigneeEmail ?? "",
        }
      : null,
    columnId: row.columnId,
    columnName: row.columnName,
    boardId: row.boardId,
    boardName: row.boardName,
    teamId: row.teamId,
    teamName: row.teamName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const searchCardsSchema = z.object({
  query: z.string().trim().max(200).optional(),
  teamId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  assignedToMe: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export type CardSearchHit = {
  cardId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assignee: { userId: string; name: string } | null;
  columnId: string;
  columnName: string;
  teamId: string;
  teamName: string;
  updatedAt: string;
};

/**
 * Search cards across every board the actor can open.
 *
 * Scoped by `listVisibleTeams` rather than by a team id from the caller, so the
 * default — no `teamId` given — is still confined to this person's teams. An
 * explicit `teamId` narrows that set; it can never widen it, because it is
 * intersected with the visible list rather than trusted.
 *
 * Paginated because an agent asking "what's on my plate?" across a busy
 * organisation would otherwise pull every card in it into a single tool result.
 */
export async function searchCardsFor(
  actor: Actor,
  input: {
    query?: string;
    teamId?: string;
    assigneeId?: string;
    assignedToMe?: boolean;
    unassigned?: boolean;
    dueBefore?: string;
    dueAfter?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ hits: CardSearchHit[]; total: number; limit: number; offset: number }> {
  const parsed = searchCardsSchema.parse(input);

  let teamIds = await visibleTeamIds(actor);
  if (parsed.teamId) {
    // Intersect, never replace. A team id the actor cannot see narrows the scope
    // to nothing rather than reaching into it.
    teamIds = teamIds.filter((id) => id === parsed.teamId);
  }

  if (teamIds.length === 0) {
    return { hits: [], total: 0, limit: parsed.limit, offset: parsed.offset };
  }

  const filters = [inArray(board.teamId, teamIds)];

  if (parsed.query) {
    const pattern = `%${parsed.query}%`;
    filters.push(
      or(ilike(card.title, pattern), ilike(card.description, pattern))!,
    );
  }
  if (parsed.assignedToMe) filters.push(eq(card.assigneeId, actor.userId));
  if (parsed.assigneeId) filters.push(eq(card.assigneeId, parsed.assigneeId));
  if (parsed.unassigned) filters.push(sql`${card.assigneeId} is null`);
  if (parsed.dueBefore) filters.push(lte(card.dueDate, new Date(parsed.dueBefore)));
  if (parsed.dueAfter) filters.push(gte(card.dueDate, new Date(parsed.dueAfter)));

  const where = and(...filters);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .where(where);

  const rows = await db
    .select({
      id: card.id,
      title: card.title,
      description: card.description,
      dueDate: card.dueDate,
      updatedAt: card.updatedAt,
      columnId: boardColumn.id,
      columnName: boardColumn.name,
      teamId: team.id,
      teamName: team.name,
      assigneeId: user.id,
      assigneeName: user.name,
    })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .innerJoin(team, eq(team.id, board.teamId))
    .leftJoin(user, eq(user.id, card.assigneeId))
    .where(where)
    .orderBy(desc(card.updatedAt))
    .limit(parsed.limit)
    .offset(parsed.offset);

  return {
    hits: rows.map((row) => ({
      cardId: row.id,
      title: row.title,
      description: row.description,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      assignee: row.assigneeId
        ? { userId: row.assigneeId, name: row.assigneeName ?? "" }
        : null,
      columnId: row.columnId,
      columnName: row.columnName,
      teamId: row.teamId,
      teamName: row.teamName,
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    limit: parsed.limit,
    offset: parsed.offset,
  };
}
