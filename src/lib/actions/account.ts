"use server";

import { eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { member, organization, team, teamMember, user } from "@/lib/db/auth-schema";
import { requireUser } from "@/lib/auth-guards";
import { soleOwnedOrganizations } from "@/lib/account-deletion";
import { runAction, type ActionResult } from "./shared";

export type AccountFootprint = {
  organizations: number;
  teams: number;
  soleOwnerOf: string[];
};

/** What actually disappears, counted from their real data. */
export async function getAccountFootprint(): Promise<
  ActionResult<AccountFootprint>
> {
  return runAction(async () => {
    const session = await requireUser();

    const orgs = await db
      .select({ id: member.organizationId })
      .from(member)
      .where(eq(member.userId, session.user.id));

    const teams = await db
      .select({ id: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, session.user.id));

    const orphaned = await soleOwnedOrganizations(session.user.id);

    return {
      organizations: orgs.length,
      teams: teams.length,
      soleOwnerOf: orphaned.map((o) => o.name),
    };
  });
}

/**
 * Download my data — the signed-in user's own rows only.
 *
 * Never a password hash, never another user's rows. The session is the only
 * source of whose data this is.
 */
export async function exportMyData(): Promise<ActionResult<string>> {
  return runAction(async () => {
    const session = await requireUser();
    const userId = session.user.id;

    const [profile] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const memberships = await db
      .select({
        organization: organization.name,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId));

    const teams = await db
      .select({ team: team.name, organization: organization.name })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(organization, eq(organization.id, team.organizationId))
      .where(eq(teamMember.userId, userId));

    const cards = await db
      .select({
        title: card.title,
        description: card.description,
        dueDate: card.dueDate,
        column: boardColumn.name,
        board: board.name,
        createdById: card.createdById,
        assigneeId: card.assigneeId,
        createdAt: card.createdAt,
      })
      .from(card)
      .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
      .innerJoin(board, eq(board.id, boardColumn.boardId))
      .where(or(eq(card.createdById, userId), eq(card.assigneeId, userId)));

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile,
        organizations: memberships,
        teams,
        cards: cards.map((c) => ({
          title: c.title,
          description: c.description,
          dueDate: c.dueDate,
          column: c.column,
          board: c.board,
          createdAt: c.createdAt,
          createdByMe: c.createdById === userId,
          assignedToMe: c.assigneeId === userId,
        })),
      },
      null,
      2,
    );
  });
}
