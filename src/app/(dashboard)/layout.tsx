import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, team, teamMember } from "@/lib/db/auth-schema";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The sign-in check is written once, here, and it runs on the server.
  // Anything that reads or writes data re-checks where it runs — this layout is
  // convenience, not the security boundary.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const organizations = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(organization.name));

  const activeOrganizationId =
    session.session.activeOrganizationId &&
    organizations.some((o) => o.id === session.session.activeOrganizationId)
      ? session.session.activeOrganizationId
      : (organizations[0]?.id ?? null);

  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);

  const teams = activeOrganizationId
    ? await listVisibleTeams(
        activeOrganizationId,
        session.user.id,
        activeOrg?.role ?? "member",
      )
    : [];

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        emailVerified: session.user.emailVerified,
      }}
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      teams={teams}
    >
      {children}
    </AppShell>
  );
}

/**
 * Owners and Admins administer every team in their organisation; a Member only
 * sees the teams they were actually added to. This mirrors `requireTeamAccess`
 * exactly — a switcher listing a team the guard would refuse is a dead link.
 */
async function listVisibleTeams(
  organizationId: string,
  userId: string,
  role: string,
) {
  if (role === "owner" || role === "admin") {
    return db
      .select({ id: team.id, name: team.name })
      .from(team)
      .where(eq(team.organizationId, organizationId))
      .orderBy(asc(team.name));
  }

  return db
    .select({ id: team.id, name: team.name })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(
      and(eq(teamMember.userId, userId), eq(team.organizationId, organizationId)),
    )
    .orderBy(asc(team.name));
}
