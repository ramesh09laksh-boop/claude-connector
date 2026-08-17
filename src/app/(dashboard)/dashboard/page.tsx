import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, team, teamMember } from "@/lib/db/auth-schema";
import { requireUser } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

/**
 * /dashboard is a router, not a page: active organisation → active team →
 * board. Nobody should land on a page that only says "Welcome back".
 */
export default async function DashboardPage() {
  const session = await requireUser();

  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id));

  if (memberships.length === 0) redirect("/onboarding");

  const preferred =
    memberships.find(
      (m) => m.organizationId === session.session.activeOrganizationId,
    ) ?? memberships[0];

  const teams =
    preferred.role === "owner" || preferred.role === "admin"
      ? await db
          .select({ id: team.id })
          .from(team)
          .where(eq(team.organizationId, preferred.organizationId))
          .orderBy(asc(team.createdAt))
      : await db
          .select({ id: team.id })
          .from(teamMember)
          .innerJoin(team, eq(team.id, teamMember.teamId))
          .where(
            and(
              eq(teamMember.userId, session.user.id),
              eq(team.organizationId, preferred.organizationId),
            ),
          )
          .orderBy(asc(team.createdAt));

  const active =
    teams.find((t) => t.id === session.session.activeTeamId) ?? teams[0];

  if (!active) redirect("/teams");

  redirect(`/teams/${active.id}`);
}
