import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { board } from "@/lib/db/schema";
import { member, organization, team, teamMember } from "@/lib/db/auth-schema";
import type { Actor } from "@/lib/actor";
import { requireTeamAccess } from "@/lib/board-guards";
import { getBoardState, getTeamMembers, type BoardState } from "@/lib/boards";
import { isOrgRole, type OrgRole } from "@/lib/permissions";

/**
 * Reads that answer "what can this person see?", shared by the UI and the MCP
 * tools.
 *
 * These are plain functions taking an `Actor`, never `"use server"` — an
 * exported action that accepts the actor from its caller is a public endpoint
 * where the caller nominates whose data to return.
 */

export type VisibleTeam = {
  teamId: string;
  teamName: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  boardId: string;
  boardName: string;
};

/**
 * Every team this actor may open, across every organisation they belong to.
 *
 * The rule it encodes — Owners and Admins get every team in their organisation,
 * a Member gets only the teams they were added to — is the same one
 * `requireTeamAccess` enforces per-team. It was written out by hand in the
 * dashboard router and the teams list before this existed; card search needs it
 * too, and three copies of a visibility rule is how a board starts showing up
 * where it shouldn't.
 *
 * Teams whose board is somehow missing are dropped rather than returned broken:
 * `requireTeamAccess` treats that as an invariant violation, and a list is not
 * the place to discover it.
 */
export async function listVisibleTeams(actor: Actor): Promise<VisibleTeam[]> {
  const rows = await db
    .select({
      teamId: team.id,
      teamName: team.name,
      organizationId: team.organizationId,
      organizationName: organization.name,
      role: member.role,
      boardId: board.id,
      boardName: board.name,
      teamMemberId: teamMember.id,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(team, eq(team.organizationId, member.organizationId))
    .innerJoin(board, eq(board.teamId, team.id))
    .leftJoin(
      teamMember,
      and(eq(teamMember.teamId, team.id), eq(teamMember.userId, actor.userId)),
    )
    .where(
      and(
        eq(member.userId, actor.userId),
        // An Owner or Admin sees the whole organisation; everyone else needs the
        // teamMember row. Expressed in SQL so the filter can't be forgotten by a
        // later caller that only reads part of the result.
        or(
          inArray(member.role, ["owner", "admin"]),
          eq(teamMember.userId, actor.userId),
        ),
      ),
    )
    .orderBy(asc(organization.name), asc(team.name));

  return rows.flatMap((row) =>
    isOrgRole(row.role)
      ? [
          {
            teamId: row.teamId,
            teamName: row.teamName,
            organizationId: row.organizationId,
            organizationName: row.organizationName,
            role: row.role,
            boardId: row.boardId,
            boardName: row.boardName,
          },
        ]
      : [],
  );
}

/** Just the ids, for scoping a cross-board query such as card search. */
export async function visibleTeamIds(actor: Actor): Promise<string[]> {
  return (await listVisibleTeams(actor)).map((t) => t.teamId);
}

/** One team's board, guarded. */
export async function getBoardFor(
  actor: Actor,
  teamId: string,
): Promise<BoardState & { role: OrgRole }> {
  const access = await requireTeamAccess(actor, teamId);
  const state = await getBoardState(access.team.id);

  // requireTeamAccess already refused a team without a board, so this is
  // belt-and-braces rather than a reachable branch.
  if (!state) throw new Error(`Board for team ${teamId} vanished mid-read`);

  return { ...state, role: access.role };
}

/**
 * Who is on a team, and who may be assigned a card there.
 *
 * `onTeam` is the flag that matters for assignment: org Admins and Owners can
 * see the board without a teamMember row, so they are assignable too. This
 * mirrors `getAssignableMembers`, which the card writes check against.
 */
export async function listTeamMembersFor(actor: Actor, teamId: string) {
  const access = await requireTeamAccess(actor, teamId);
  const members = await getTeamMembers(access.team.id);

  return {
    teamId: access.team.id,
    teamName: access.team.name,
    members: members.map((m) => ({
      userId: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      assignable: m.onTeam,
    })),
  };
}
