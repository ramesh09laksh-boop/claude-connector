import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/auth-schema";
import { UnauthenticatedError, requireUser } from "@/lib/auth-guards";

/**
 * Who is doing this, and how they proved it.
 *
 * There are now two ways into Lanes' data — a session cookie in the browser, and
 * an OAuth access token from the MCP server at `/mcp`. The guards in
 * `board-guards.ts` are the single boundary both must pass, so they take one of
 * these rather than reaching for `next/headers` themselves. A route handler
 * serving a bearer token has no cookies to read.
 *
 * `userId` is still only ever established server-side: from a verified session,
 * or from a token better-auth has already verified and looked up. It is never
 * accepted from a tool argument, a form field or a header.
 */
export type Actor = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /**
   * `session` means a cookie, and only then may a caller use the parts of
   * better-auth's API that read one — `setActiveOrganization` and friends take
   * `headers` and silently do nothing useful without them.
   */
  via: "session" | "mcp";
};

/** The signed-in browser user. Throws `UnauthenticatedError`, as before. */
export async function sessionActor(): Promise<Actor> {
  const session = await requireUser();
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
    via: "session",
  };
}

/**
 * The user behind an MCP access token.
 *
 * The row is read fresh rather than taken from anything cached alongside the
 * token, for the reason `requireAdmin` gives about the platform-admin flag: a
 * token lives for an hour and is refreshed for weeks, so a name or a
 * verification state captured at issue time goes stale. A token whose user has
 * since been deleted is not an actor.
 */
export async function mcpActor(token: { userId?: string | null }): Promise<Actor> {
  if (!token.userId) throw new UnauthenticatedError();

  const [row] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      emailVerified: userTable.emailVerified,
    })
    .from(userTable)
    .where(eq(userTable.id, token.userId))
    .limit(1);

  if (!row) throw new UnauthenticatedError();

  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    via: "mcp",
  };
}
