import "server-only";

import { headers } from "next/headers";

import { auth, isPlatformAdmin } from "@/lib/auth";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Sign in to continue") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * The session is the only acceptable source of the current user. A user id
 * taken from a form field, query parameter, body or header is a defect even
 * where the surrounding code looks correct.
 */
export async function requireUser(): Promise<AppSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function getOptionalUser(): Promise<AppSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * The PLATFORM admin check, gating /settings/system only — not an organisation
 * Owner. An organisation Owner who was not the first account on this instance
 * sees nothing there, and that is correct.
 */
export async function requireAdmin(): Promise<AppSession> {
  const session = await requireUser();
  // Read the flag from the database rather than trusting the session copy, so
  // a role revoked mid-session takes effect immediately.
  if (!(await isPlatformAdmin(session.user.id))) {
    throw new NotFoundError("Not available");
  }
  return session;
}
