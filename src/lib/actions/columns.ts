"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { boardColumn, card } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { getBoardState, type BoardState } from "@/lib/boards";
import {
  NotFoundError,
  requireColumnAccess,
  requireTeamPermission,
} from "@/lib/board-guards";
import { runAction, type ActionResult } from "./shared";

const COLUMN_PERMISSIONS = {
  create: { column: ["create"] },
  update: { column: ["update"] },
  delete: { column: ["delete"] },
} as const;

const uuidish = z.string().uuid();

export async function createColumn(input: {
  teamId: string;
  name: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = z
      .object({
        teamId: z.string().min(1),
        name: z.string().trim().min(1, "Give the column a name.").max(80),
      })
      .parse(input);

    const access = await requireTeamPermission(
      parsed.teamId,
      COLUMN_PERMISSIONS.create,
    );

    await db.transaction(async (tx) => {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(boardColumn)
        .where(eq(boardColumn.boardId, access.board.id));

      await tx.insert(boardColumn).values({
        boardId: access.board.id,
        name: parsed.name,
        position: n,
      });
    });

    await logActivity(
      "column.created",
      { teamId: access.team.id, name: parsed.name },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

export async function renameColumn(input: {
  columnId: string;
  name: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = z
      .object({
        columnId: uuidish,
        name: z.string().trim().min(1, "Give the column a name.").max(80),
      })
      .parse(input);

    const access = await requireColumnAccess(
      parsed.columnId,
      COLUMN_PERMISSIONS.update,
    );

    await db
      .update(boardColumn)
      .set({ name: parsed.name })
      .where(eq(boardColumn.id, parsed.columnId));

    await logActivity(
      "column.renamed",
      { teamId: access.team.id, from: access.column.name, to: parsed.name },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

/**
 * Deleting a column that holds cards has to be an explicit decision, not a
 * cascade the user discovers afterwards. Either the caller says where the cards
 * go, or the action refuses and says how many are in the way.
 */
export async function deleteColumn(input: {
  columnId: string;
  moveCardsTo?: string | null;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = z
      .object({ columnId: uuidish, moveCardsTo: uuidish.nullish() })
      .parse(input);

    const access = await requireColumnAccess(
      parsed.columnId,
      COLUMN_PERMISSIONS.delete,
    );

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(card)
      .where(eq(card.columnId, parsed.columnId));

    if (n > 0 && !parsed.moveCardsTo) {
      throw new NotFoundError(
        `“${access.column.name}” still holds ${n} ${n === 1 ? "card" : "cards"}. Choose where they should go first.`,
      );
    }

    if (parsed.moveCardsTo) {
      const [destination] = await db
        .select({ id: boardColumn.id, boardId: boardColumn.boardId })
        .from(boardColumn)
        .where(eq(boardColumn.id, parsed.moveCardsTo))
        .limit(1);

      // Same-board assertion again: a column id from another organisation
      // would otherwise scoop this column's cards into their board.
      if (
        !destination ||
        destination.boardId !== access.board.id ||
        destination.id === parsed.columnId
      ) {
        throw new NotFoundError("That column isn't on this board.");
      }
    }

    await db.transaction(async (tx) => {
      if (parsed.moveCardsTo) {
        const [{ base }] = await tx
          .select({ base: sql<number>`count(*)::int` })
          .from(card)
          .where(eq(card.columnId, parsed.moveCardsTo));

        const moving = await tx
          .select({ id: card.id })
          .from(card)
          .where(eq(card.columnId, parsed.columnId))
          .orderBy(asc(card.position));

        for (let i = 0; i < moving.length; i++) {
          await tx
            .update(card)
            .set({
              columnId: parsed.moveCardsTo,
              position: base + i,
              updatedAt: new Date(),
            })
            .where(eq(card.id, moving[i].id));
        }
      }

      await tx.delete(boardColumn).where(eq(boardColumn.id, parsed.columnId));

      const remaining = await tx
        .select({ id: boardColumn.id })
        .from(boardColumn)
        .where(eq(boardColumn.boardId, access.board.id))
        .orderBy(asc(boardColumn.position));

      for (let i = 0; i < remaining.length; i++) {
        await tx
          .update(boardColumn)
          .set({ position: i })
          .where(eq(boardColumn.id, remaining[i].id));
      }
    });

    await logActivity(
      "column.deleted",
      {
        teamId: access.team.id,
        name: access.column.name,
        cardsMoved: parsed.moveCardsTo ? n : 0,
      },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}

export async function reorderColumns(input: {
  teamId: string;
  orderedIds: string[];
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => {
    const parsed = z
      .object({ teamId: z.string().min(1), orderedIds: z.array(uuidish).min(1) })
      .parse(input);

    const access = await requireTeamPermission(
      parsed.teamId,
      COLUMN_PERMISSIONS.update,
    );

    const existing = await db
      .select({ id: boardColumn.id })
      .from(boardColumn)
      .where(eq(boardColumn.boardId, access.board.id));

    // The submitted set must be exactly this board's columns — no extras from
    // another board, none of this board's left out.
    const existingIds = new Set(existing.map((c) => c.id));
    const submitted = new Set(parsed.orderedIds);
    const sameSize =
      existingIds.size === submitted.size &&
      parsed.orderedIds.length === submitted.size;

    if (!sameSize || parsed.orderedIds.some((id) => !existingIds.has(id))) {
      throw new NotFoundError("That column order doesn't match this board.");
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < parsed.orderedIds.length; i++) {
        await tx
          .update(boardColumn)
          .set({ position: i })
          .where(eq(boardColumn.id, parsed.orderedIds[i]));
      }
    });

    await logActivity(
      "column.reordered",
      { teamId: access.team.id, count: parsed.orderedIds.length },
      access.session.user.id,
    );

    revalidatePath(`/teams/${access.team.id}`);
    return getBoardState(access.team.id);
  });
}
