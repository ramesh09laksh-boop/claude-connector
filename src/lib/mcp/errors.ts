import "server-only";

import { z } from "zod";

import { NotFoundError, UnauthenticatedError } from "@/lib/auth-guards";

/**
 * Turning a thrown guard into something an agent can act on.
 *
 * This is the MCP counterpart of `runAction` in `lib/actions/shared.ts`, and it
 * keeps that file's most important rule: a row that does not exist and a row in
 * somebody else's organisation produce the *same* message. Distinguishing them
 * would confirm the second one exists, which is the whole reason the guards
 * throw NotFoundError rather than a permission error.
 *
 * The messages tell the agent what to do next. "Not found" on its own invites a
 * model to retry the identical call; naming the tool that produces valid ids
 * gets it unstuck in one step.
 */

export type ToolFailure = {
  content: { type: "text"; text: string }[];
  isError: true;
};

function fail(text: string): ToolFailure {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Zod rejects bad arguments before any database work happens, so this is the
 * common case for a model that guessed at a shape. Report the field and the
 * reason, not a serialised issue tree.
 */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
  return `Those arguments aren't valid: ${issues}`;
}

export function toToolFailure(cause: unknown): ToolFailure {
  if (cause instanceof z.ZodError) {
    return fail(formatZodError(cause));
  }

  if (cause instanceof UnauthenticatedError) {
    return fail(
      "That access token is no longer valid. Reconnect the Lanes connector to continue.",
    );
  }

  if (cause instanceof NotFoundError) {
    // `NotFoundError` carries a specific message for the refusals worth
    // explaining — "that person isn't on this team", "that column isn't on this
    // board", the non-empty column case — and the bare default otherwise.
    const message = cause.message || "Not found.";
    const isBareNotFound = message === "Not found";
    return fail(
      isBareNotFound
        ? "No such item, or it belongs to a team you're not on. Call lanes_list_teams for the teams you can open, then lanes_get_board for that team's column and card ids."
        : message,
    );
  }

  // Anything else is a bug in Lanes, not something the agent can fix by
  // retrying with different arguments. Log it here; say nothing specific there.
  console.error("[mcp]", cause);
  return fail("Something went wrong in Lanes. Try again.");
}

/** Wraps a tool body so no handler has to repeat the try/catch. */
export async function runTool<T>(
  fn: () => Promise<T>,
  shape: (value: T) => {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
  },
): Promise<
  | { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown> }
  | ToolFailure
> {
  try {
    return shape(await fn());
  } catch (cause) {
    return toToolFailure(cause);
  }
}
