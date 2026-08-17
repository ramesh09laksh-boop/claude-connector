import "server-only";

import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

/**
 * Lanes' own verbs. Never a route or a table name — "who moved that card?" is
 * the question this answers, and `POST /api/cards` does not answer it.
 */
export type ActivityAction =
  | "organization.created"
  | "team.created"
  | "board.created"
  | "column.created"
  | "column.renamed"
  | "column.deleted"
  | "column.reordered"
  | "card.created"
  | "card.updated"
  | "card.moved"
  | "card.deleted"
  | "invite.created"
  | "invite.revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "account.deleted";

/**
 * Log writes, never reads.
 *
 * Never put a token, password or full payload in `detail` — ids and the names
 * of changed fields are enough. The invite token in particular must never
 * appear here: it is a bearer credential, and this table is rendered on a page.
 */
export async function logActivity(
  action: ActivityAction,
  detail?: Record<string, unknown>,
  userId?: string | null,
) {
  try {
    await db.insert(activityLog).values({
      userId: userId ?? null,
      action,
      detail: detail ?? null,
    });
  } catch (cause) {
    // A failed audit write must not fail the user's action. Surface it in the
    // server log instead of turning a card move into an error page.
    console.error(`[activity] failed to log ${action}`, cause);
  }
}
