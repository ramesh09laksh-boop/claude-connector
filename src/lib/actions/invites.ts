"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teamInviteLink } from "@/lib/db/schema";
import { member, teamMember } from "@/lib/db/auth-schema";
import { logActivity } from "@/lib/activity";
import {
  NotFoundError,
  requireOrgPermission,
  requireTeamAccess,
  requireUser,
} from "@/lib/board-guards";
import { resolveInviteToken } from "@/lib/invites";
import { orgRoles, roleRank, type OrgRole } from "@/lib/permissions";
import { runAction, type ActionResult } from "./shared";

/**
 * 32 URL-safe characters, ~192 bits.
 *
 * Deliberately not the row's UUID: a UUID as a bearer credential invites
 * someone to guess a version or a timestamp out of it, and this token is a
 * secret in a way a row id should not have to be.
 */
function newToken() {
  return randomBytes(24).toString("base64url");
}

export async function createInviteLink(input: {
  teamId: string;
  role: OrgRole;
  expiresInDays?: number;
}): Promise<ActionResult<{ token: string }>> {
  return runAction(async () => {
    const parsed = z
      .object({
        teamId: z.string().min(1),
        role: z.enum(orgRoles),
        expiresInDays: z.number().int().min(1).max(30).default(7),
      })
      .parse(input);

    const access = await requireTeamAccess(parsed.teamId);
    await requireOrgPermission(access.organizationId, { invitation: ["create"] });

    // The privilege-escalation hole in this feature: without it an Admin mints
    // an Owner link and hands themselves the organisation.
    if (roleRank(parsed.role) < roleRank(access.role)) {
      throw new NotFoundError(`You can't create a link that grants ${parsed.role}.`);
    }

    // An unconfirmed address shouldn't be handing out access to a board.
    if (!access.session.user.emailVerified) {
      throw new NotFoundError(
        "Confirm your email address before creating invite links.",
      );
    }

    const token = newToken();
    const expiresAt = new Date(
      Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000,
    );

    await db.transaction(async (tx) => {
      // One active link per team-and-role: a new one replaces the old.
      await tx
        .update(teamInviteLink)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(teamInviteLink.teamId, parsed.teamId),
            eq(teamInviteLink.role, parsed.role),
            isNull(teamInviteLink.revokedAt),
          ),
        );

      await tx.insert(teamInviteLink).values({
        token,
        organizationId: access.organizationId,
        teamId: parsed.teamId,
        role: parsed.role,
        createdById: access.session.user.id,
        expiresAt,
      });
    });

    // Note what was created, never the token itself — this table is rendered
    // on the system page.
    await logActivity(
      "invite.created",
      { teamId: parsed.teamId, role: parsed.role, expiresAt: expiresAt.toISOString() },
      access.session.user.id,
    );

    revalidatePath(`/teams/${parsed.teamId}/members`);
    return { token };
  });
}

export async function revokeInviteLink(input: {
  linkId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const parsed = z.object({ linkId: z.string().uuid() }).parse(input);

    const [link] = await db
      .select({ teamId: teamInviteLink.teamId, role: teamInviteLink.role })
      .from(teamInviteLink)
      .where(eq(teamInviteLink.id, parsed.linkId))
      .limit(1);

    if (!link) throw new NotFoundError("That link no longer exists.");

    const access = await requireTeamAccess(link.teamId);
    await requireOrgPermission(access.organizationId, { invitation: ["cancel"] });

    await db
      .update(teamInviteLink)
      .set({ revokedAt: new Date() })
      .where(eq(teamInviteLink.id, parsed.linkId));

    await logActivity(
      "invite.revoked",
      { teamId: link.teamId, role: link.role },
      access.session.user.id,
    );

    revalidatePath(`/teams/${link.teamId}/members`);
    return undefined;
  });
}

/**
 * Accepting is idempotent and re-validates the token server-side.
 *
 * The page render is not the check — a link can be revoked or expire between
 * the page loading and the visitor clicking Join.
 */
export async function acceptInviteLink(input: {
  token: string;
}): Promise<ActionResult<{ teamId: string; alreadyMember: boolean }>> {
  return runAction(async () => {
    const parsed = z.object({ token: z.string().min(1).max(200) }).parse(input);
    const session = await requireUser();

    const invite = await resolveInviteToken(parsed.token);

    if (invite.status === "unknown") {
      throw new NotFoundError("This invite link isn't valid.");
    }
    if (invite.status === "revoked") {
      throw new NotFoundError("This invite has been revoked.");
    }
    if (invite.status === "expired") {
      throw new NotFoundError("This invite has expired. Ask for a new one.");
    }

    const [existing] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, invite.organizationId),
          eq(member.userId, session.user.id),
        ),
      )
      .limit(1);

    let alreadyMember = Boolean(existing);

    if (!existing) {
      // Membership stays Better Auth's, which is the rule that matters. Lanes
      // owns only the link.
      await auth.api.addMember({
        body: {
          userId: session.user.id,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      });
    }

    const [onTeam] = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, invite.teamId),
          eq(teamMember.userId, session.user.id),
        ),
      )
      .limit(1);

    if (onTeam) {
      alreadyMember = true;
    } else {
      // A double-click must add one membership and not throw.
      await db
        .insert(teamMember)
        .values({
          id: crypto.randomUUID(),
          teamId: invite.teamId,
          userId: session.user.id,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      await db
        .update(teamInviteLink)
        .set({ useCount: sql`${teamInviteLink.useCount} + 1` })
        .where(eq(teamInviteLink.id, invite.linkId));

      await logActivity(
        "member.joined",
        { teamId: invite.teamId, via: "invite_link", role: invite.role },
        session.user.id,
      );
    }

    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: invite.organizationId },
    });

    revalidatePath(`/teams/${invite.teamId}`);
    return { teamId: invite.teamId, alreadyMember };
  });
}
