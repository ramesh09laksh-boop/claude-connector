import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { board, boardColumn } from "@/lib/db/schema";

/** Every new board starts with these. */
export const DEFAULT_COLUMNS = ["To Do", "Doing", "Done"] as const;

/**
 * Create a team's board and its three default columns in one transaction.
 *
 * Idempotent: `board.team_id` is unique, so a second call for the same team
 * returns the existing board rather than failing. That matters because this
 * runs from a Better Auth hook, and a retried request must not error.
 */
export async function seedBoardForTeam(teamId: string, teamName: string) {
  const existing = await db
    .select({ id: board.id })
    .from(board)
    .where(eq(board.teamId, teamId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(board)
      .values({ teamId, name: `${teamName} board` })
      .onConflictDoNothing({ target: board.teamId })
      .returning({ id: board.id });

    if (!created) {
      const [already] = await tx
        .select({ id: board.id })
        .from(board)
        .where(eq(board.teamId, teamId))
        .limit(1);
      return already;
    }

    await tx.insert(boardColumn).values(
      DEFAULT_COLUMNS.map((name, position) => ({
        boardId: created.id,
        name,
        position,
      })),
    );

    return created;
  });
}
