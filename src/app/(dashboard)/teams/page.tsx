import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { member, team, teamMember } from "@/lib/db/auth-schema";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { CreateTeamForm } from "./create-team-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
  description: "The teams in your organisation, and their boards.",
};

export default async function TeamsPage() {
  const session = await requireUserOrRedirect();

  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id));

  if (memberships.length === 0) redirect("/onboarding");

  const active =
    memberships.find(
      (m) => m.organizationId === session.session.activeOrganizationId,
    ) ?? memberships[0];

  const canCreate = active.role === "owner" || active.role === "admin";

  const teams = canCreate
    ? await db
        .select({ id: team.id, name: team.name })
        .from(team)
        .where(eq(team.organizationId, active.organizationId))
        .orderBy(asc(team.name))
    : await db
        .select({ id: team.id, name: team.name })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .where(
          and(
            eq(teamMember.userId, session.user.id),
            eq(team.organizationId, active.organizationId),
          ),
        )
        .orderBy(asc(team.name));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
      <p className="mt-1 text-muted-foreground">
        Each team has one board. Pick one to get to work.
      </p>

      {teams.length > 0 ? (
        <ul className="mt-8 divide-y rounded-lg border">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center gap-3 p-4">
              <span className="font-medium">{t.name}</span>
              <Button
                render={<Link href={`/teams/${t.id}`} />}
                nativeButton={false}
                variant="outline"
                size="sm"
                className="ml-auto"
              >
                Open board
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        // A real empty state, not a blank panel.
        <div className="mt-8 rounded-lg border border-dashed p-10 text-center">
          <h2 className="font-medium">No teams yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {canCreate
              ? "Create your first team and Lanes will set up its board with To Do, Doing and Done."
              : "Nobody has added you to a team in this organisation yet. Ask an owner or admin for an invite link."}
          </p>
        </div>
      )}

      {canCreate ? (
        <div className="mt-8">
          <CreateTeamForm organizationId={active.organizationId} />
        </div>
      ) : null}
    </div>
  );
}
