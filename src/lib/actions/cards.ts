"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { getAssignableMembers, getBoardState, type BoardState } from "@/lib/boards";
import {
  NotFoundError,
  requireCardAccess,
  requireColumnAccess,
} from "@/lib/board-guards";
import { runAction, type ActionResult } from "./shared";

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

export async function createCard(input: {
  columnId: string;
  title: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = createCardSchema.parse(input);
    const access = await requireColumnAccess(
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
        createdById: access.session.user.id,
      });
    });

    await logActivity(
      "card.created",
      { teamId: access.team.id, columnId: parsed.columnId, title: parsed.title },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

export async function updateCard(input: {
  cardId: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = updateCardSchema.parse(input);
    const access = await requireCardAccess(parsed.cardId, CARD_PERMISSIONS.update);

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
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

export async function deleteCard(input: {
  cardId: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = z.object({ cardId: uuidish }).parse(input);
    const access = await requireCardAccess(parsed.cardId, CARD_PERMISSIONS.delete);
    const sourceColumnId = access.card.columnId;

    await db.transaction(async (tx) => {
      await tx.delete(card).where(eq(card.id, parsed.cardId));
      await renumberColumn(tx, sourceColumnId);
    });

    await logActivity(
      "card.deleted",
      { teamId: access.team.id, cardId: parsed.cardId, title: access.card.title },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

/**
 * The one to get right.
 *
 * `toColumnId` is the cross-tenant hole in this feature: a valid card id of
 * yours plus a column id from another organisation would move your card into
 * their board. The same-board assertion below is what closes it.
 */
export async function moveCard(input: {
  cardId: string;
  toColumnId: string;
  toIndex: number;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = moveCardSchema.parse(input);
    const access = await requireCardAccess(parsed.cardId, CARD_PERMISSIONS.update);

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
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}
