import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { teamInviteLink } from "@/lib/db/schema";
import { organization, team } from "@/lib/db/auth-schema";
import type { OrgRole } from "@/lib/permissions";

export type InviteState =
  | { status: "unknown" }
  | { status: "revoked" }
  | { status: "expired" }
  | {
      status: "valid";
      linkId: string;
      role: OrgRole;
      teamId: string;
      teamName: string;
      organizationId: string;
      organizationName: string;
      useCount: number;
      expiresAt: Date;
    };

/**
 * Resolve a token to what the visitor should see.
 *
 * The token is compared in full, never by prefix — it is a bearer credential,
 * and a prefix match turns a 192-bit secret into a much shorter one.
 */
export async function resolveInviteToken(token: string): Promise<InviteState> {
  if (!token) return { status: "unknown" };

  const [row] = await db
    .select({
      id: teamInviteLink.id,
      role: teamInviteLink.role,
      teamId: teamInviteLink.teamId,
      organizationId: teamInviteLink.organizationId,
      expiresAt: teamInviteLink.expiresAt,
      revokedAt: teamInviteLink.revokedAt,
      useCount: teamInviteLink.useCount,
      teamName: team.name,
      organizationName: organization.name,
    })
    .from(teamInviteLink)
    .innerJoin(team, eq(team.id, teamInviteLink.teamId))
    .innerJoin(organization, eq(organization.id, teamInviteLink.organizationId))
    .where(eq(teamInviteLink.token, token))
    .limit(1);

  if (!row) return { status: "unknown" };
  if (row.revokedAt) return { status: "revoked" };
  if (row.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  return {
    status: "valid",
    linkId: row.id,
    role: row.role as OrgRole,
    teamId: row.teamId,
    teamName: row.teamName,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    useCount: row.useCount,
    expiresAt: row.expiresAt,
  };
}

/** The live link for a team, if there is one. Used by the members page. */
export async function getActiveInviteLinks(teamId: string) {
  return db
    .select({
      id: teamInviteLink.id,
      token: teamInviteLink.token,
      role: teamInviteLink.role,
      useCount: teamInviteLink.useCount,
      expiresAt: teamInviteLink.expiresAt,
      createdAt: teamInviteLink.createdAt,
    })
    .from(teamInviteLink)
    .where(and(eq(teamInviteLink.teamId, teamId), isNull(teamInviteLink.revokedAt)))
    .orderBy(desc(teamInviteLink.createdAt));
}
