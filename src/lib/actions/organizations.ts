"use server";

import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, team, teamMember } from "@/lib/db/auth-schema";
import { logActivity } from "@/lib/activity";
import {
  NotFoundError,
  requireOrgMember,
  requireOrgPermission,
  requireTeamAccess,
  requireUser,
} from "@/lib/board-guards";
import { orgRoles, roleRank, type OrgRole } from "@/lib/permissions";
import { runAction, type ActionResult } from "./shared";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `org-${suffix}`;
}

/**
 * First run: an organisation, its first team, that team's board and the three
 * default columns.
 *
 * Better Auth owns the organisation and the membership; the board and columns
 * are seeded by the `afterCreateTeam` hook in one transaction. The two can't be
 * a single SQL transaction because the plugin writes through its own adapter,
 * so a failure after the organisation exists is compensated by deleting it —
 * the invariant that matters is that no organisation is left without a team.
 */
export async function createOrganizationWithTeam(input: {
  organizationName: string;
  teamName: string;
}): Promise<ActionResult<{ teamId: string; organizationId: string }>> {
  return runAction(async () => {
    const parsed = z
      .object({
        organizationName: z
          .string()
          .trim()
          .min(1, "Name your organisation.")
          .max(80),
        teamName: z.string().trim().min(1, "Name your first team.").max(80),
      })
      .parse(input);

    const session = await requireUser();
    const requestHeaders = await headers();

    const org = await auth.api.createOrganization({
      headers: requestHeaders,
      body: {
        name: parsed.organizationName,
        slug: slugify(parsed.organizationName),
        userId: session.user.id,
      },
    });

    if (!org) throw new NotFoundError("Couldn't create that organisation.");

    try {
      const created = await auth.api.createTeam({
        headers: requestHeaders,
        body: { name: parsed.teamName, organizationId: org.id },
      });

      if (!created) throw new NotFoundError("Couldn't create that team.");

      // The creator belongs on the team they just made.
      await db
        .insert(teamMember)
        .values({
          id: crypto.randomUUID(),
          teamId: created.id,
          userId: session.user.id,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      await auth.api.setActiveOrganization({
        headers: requestHeaders,
        body: { organizationId: org.id },
      });

      await logActivity(
        "organization.created",
        { organizationId: org.id, name: parsed.organizationName },
        session.user.id,
      );
      await logActivity(
        "team.created",
        { organizationId: org.id, teamId: created.id, name: parsed.teamName },
        session.user.id,
      );

      revalidatePath("/dashboard");
      return { teamId: created.id, organizationId: org.id };
    } catch (cause) {
      // Compensate: an organisation with no team is a state the rest of the app
      // would have to defend against forever.
      await db.delete(organization).where(eq(organization.id, org.id));
      throw cause;
    }
  });
}

export async function createTeam(input: {
  organizationId: string;
  name: string;
}): Promise<ActionResult<{ teamId: string }>> {
  return runAction(async () => {
    const parsed = z
      .object({
        organizationId: z.string().min(1),
        name: z.string().trim().min(1, "Name the team.").max(80),
      })
      .parse(input);

    const access = await requireOrgPermission(parsed.organizationId, {
      team: ["create"],
    });

    const created = await auth.api.createTeam({
      headers: await headers(),
      body: { name: parsed.name, organizationId: parsed.organizationId },
    });

    if (!created) throw new NotFoundError("Couldn't create that team.");

    await db
      .insert(teamMember)
      .values({
        id: crypto.randomUUID(),
        teamId: created.id,
        userId: access.session.user.id,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await logActivity(
      "team.created",
      {
        organizationId: parsed.organizationId,
        teamId: created.id,
        name: parsed.name,
      },
      access.session.user.id,
    );

    revalidatePath("/dashboard");
    return { teamId: created.id };
  });
}

/**
 * Switching to an organisation you don't belong to would be a one-line
 * privilege escalation, so membership is checked here before the plugin is
 * asked to set it.
 */
export async function setActiveOrganization(input: {
  organizationId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const parsed = z.object({ organizationId: z.string().min(1) }).parse(input);
    await requireOrgMember(parsed.organizationId);

    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: parsed.organizationId },
    });

    revalidatePath("/dashboard");
    return undefined;
  });
}

export async function changeMemberRole(input: {
  teamId: string;
  userId: string;
  role: OrgRole;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const parsed = z
      .object({
        teamId: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum(orgRoles),
      })
      .parse(input);

    const access = await requireTeamAccess(parsed.teamId);
    await requireOrgPermission(access.organizationId, { member: ["update"] });

    const target = await loadMember(access.organizationId, parsed.userId);

    // An Admin cannot touch an Owner, and cannot mint one.
    if (roleRank(target.role) < roleRank(access.role)) {
      throw new NotFoundError("You can't change that person's role.");
    }
    if (roleRank(parsed.role) < roleRank(access.role)) {
      throw new NotFoundError(`You can't make someone ${parsed.role}.`);
    }

    if (target.role === "owner" && parsed.role !== "owner") {
      await assertNotLastOwner(access.organizationId, parsed.userId);
    }

    await db
      .update(member)
      .set({ role: parsed.role })
      .where(eq(member.id, target.id));

    await logActivity(
      "member.role_changed",
      {
        organizationId: access.organizationId,
        userId: parsed.userId,
        from: target.role,
        to: parsed.role,
      },
      access.session.user.id,
    );

    revalidatePath(`/teams/${parsed.teamId}/members`);
    return undefined;
  });
}

export async function removeMember(input: {
  teamId: string;
  userId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const parsed = z
      .object({ teamId: z.string().min(1), userId: z.string().min(1) })
      .parse(input);

    const access = await requireTeamAccess(parsed.teamId);
    await requireOrgPermission(access.organizationId, { member: ["delete"] });

    const target = await loadMember(access.organizationId, parsed.userId);

    if (roleRank(target.role) < roleRank(access.role)) {
      throw new NotFoundError("You can't remove that person.");
    }
    if (target.role === "owner") {
      await assertNotLastOwner(access.organizationId, parsed.userId);
    }

    await db.transaction(async (tx) => {
      const teams = await tx
        .select({ id: team.id })
        .from(team)
        .where(eq(team.organizationId, access.organizationId));

      for (const t of teams) {
        await tx
          .delete(teamMember)
          .where(
            and(eq(teamMember.teamId, t.id), eq(teamMember.userId, parsed.userId)),
          );
      }

      await tx.delete(member).where(eq(member.id, target.id));
    });

    await logActivity(
      "member.removed",
      { organizationId: access.organizationId, userId: parsed.userId },
      access.session.user.id,
    );

    revalidatePath(`/teams/${parsed.teamId}/members`);
    return undefined;
  });
}

async function loadMember(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);

  if (!row) throw new NotFoundError("That person isn't in this organisation.");
  return { id: row.id, role: row.role as OrgRole };
}

/** The last Owner cannot be demoted or removed — it would orphan the org. */
async function assertNotLastOwner(organizationId: string, userId: string) {
  const others = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.role, "owner"),
        ne(member.userId, userId),
      ),
    )
    .limit(1);

  if (others.length === 0) {
    throw new NotFoundError(
      "This is the organisation's only owner. Make someone else an owner first.",
    );
  }
}
