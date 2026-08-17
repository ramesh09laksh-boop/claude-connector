import "server-only";

import { NotFoundError, UnauthenticatedError } from "@/lib/auth-guards";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

/**
 * A server action is a public HTTP endpoint with a nicer calling convention.
 * Every one of them ends up here, so a guard failure becomes a message the UI
 * can show rather than an unhandled rejection and a stack trace.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (cause) {
    if (cause instanceof UnauthenticatedError) {
      return { ok: false, error: "Sign in to continue." };
    }
    if (cause instanceof NotFoundError) {
      // Same message whether the row is missing or in somebody else's
      // organisation — telling them apart confirms the row exists.
      return { ok: false, error: cause.message || "Not found." };
    }
    console.error("[action]", cause);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
