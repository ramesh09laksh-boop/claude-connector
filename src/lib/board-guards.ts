import "server-only";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { member, team, teamMember } from "@/lib/db/auth-schema";
import {
  NotFoundError,
  requireUser,
  type AppSession,
} from "@/lib/auth-guards";
import type { OrgRole } from "@/lib/permissions";

export { NotFoundError, requireUser };

/**
 * Every read and write in the app goes through this file.
 *
 * Two rules hold everywhere below:
 *
 * 1. The organisation, team and user ids come from the session or from walking
 *    the ownership chain server-side. The one id a URL legitimately carries is
 *    the `teamId` (or `boardId`, or `cardId`) in the route; everything above it
 *    is resolved here. A `teamId` posted by the client is a value someone can
 *    change in devtools.
 *
 * 2. Failures throw NotFoundError, and pages render notFound(). A 403 on a
 *    resource in another organisation confirms that resource exists. A 404
 *    does not.
 */

export type Permissions = Record<string, readonly string[]>;

export type OrgAccess = {
  session: AppSession;
  role: OrgRole;
  organizationId: string;
};

/** The session user's role in this organisation, or not-found. */
export async function requireOrgMember(
  organizationId: string,
): Promise<OrgAccess> {
  const session = await requireUser();

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError();

  return { session, role: row.role as OrgRole, organizationId };
}

/**
 * Membership plus a permission check.
 *
 * The check runs on the server against the organisation resolved above. The
 * client-side `checkRolePermission` is for hiding controls; it is presentation,
 * never the boundary.
 */
export async function requireOrgPermission(
  organizationId: string,
  permissions: Permissions,
): Promise<OrgAccess> {
  const access = await requireOrgMember(organizationId);

  const allowed = await auth.api.hasPermission({
    headers: await headers(),
    body: { organizationId, permissions },
  });

  if (!allowed?.success) {
    throw new NotFoundError("You don't have permission to do that");
  }

  return access;
}

export type TeamAccess = OrgAccess & {
  team: { id: string; name: string; organizationId: string };
  board: { id: string; name: string };
};

/**
 * Resolve a team's organisation, assert org membership, assert the teamMember
 * row, and return the team with its board.
 */
export async function requireTeamAccess(teamId: string): Promise<TeamAccess> {
  const session = await requireUser();

  const [row] = await db
    .select({
      teamId: team.id,
      teamName: team.name,
      organizationId: team.organizationId,
      boardId: board.id,
      boardName: board.name,
    })
    .from(team)
    .leftJoin(board, eq(board.teamId, team.id))
    .where(eq(team.id, teamId))
    .limit(1);

  if (!row) throw new NotFoundError();

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, row.organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!membership) throw new NotFoundError();

  // Belonging to the organisation is not the same as belonging to the team.
  // Owners and Admins administer every team in their organisation; a Member
  // only sees the teams they were actually added to.
  const role = membership.role as OrgRole;
  if (role === "member") {
    const [onTeam] = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(
        and(eq(teamMember.teamId, teamId), eq(teamMember.userId, session.user.id)),
      )
      .limit(1);

    if (!onTeam) throw new NotFoundError();
  }

  if (!row.boardId || !row.boardName) {
    // seedBoardForTeam runs on every team creation, so this means a team row
    // outlived its board — a broken invariant, not a permission problem.
    throw new NotFoundError("This team has no board");
  }

  return {
    session,
    role,
    organizationId: row.organizationId,
    team: { id: row.teamId, name: row.teamName, organizationId: row.organizationId },
    board: { id: row.boardId, name: row.boardName },
  };
}

export async function requireTeamPermission(
  teamId: string,
  permissions: Permissions,
): Promise<TeamAccess> {
  const access = await requireTeamAccess(teamId);

  const allowed = await auth.api.hasPermission({
    headers: await headers(),
    body: { organizationId: access.organizationId, permissions },
  });

  if (!allowed?.success) {
    throw new NotFoundError("You don't have permission to do that");
  }

  return access;
}

/** A thin wrapper that resolves the team from the board, then defers upward. */
export async function requireBoardAccess(boardId: string): Promise<TeamAccess> {
  const [row] = await db
    .select({ teamId: board.teamId })
    .from(board)
    .where(eq(board.id, boardId))
    .limit(1);

  if (!row) throw new NotFoundError();
  return requireTeamAccess(row.teamId);
}

export type ColumnAccess = TeamAccess & {
  column: { id: string; boardId: string; name: string; position: number };
};

/** Walks column → board → team → organisation from the column id alone. */
export async function requireColumnAccess(
  columnId: string,
  permissions: Permissions,
): Promise<ColumnAccess> {
  const [row] = await db
    .select({
      id: boardColumn.id,
      boardId: boardColumn.boardId,
      name: boardColumn.name,
      position: boardColumn.position,
      teamId: board.teamId,
    })
    .from(boardColumn)
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .where(eq(boardColumn.id, columnId))
    .limit(1);

  if (!row) throw new NotFoundError();

  const access = await requireTeamPermission(row.teamId, permissions);

  return {
    ...access,
    column: {
      id: row.id,
      boardId: row.boardId,
      name: row.name,
      position: row.position,
    },
  };
}

export type CardAccess = TeamAccess & {
  card: {
    id: string;
    columnId: string;
    boardId: string;
    title: string;
    position: number;
  };
};

/**
 * Walks card → board_column → board → team → organisation from the card id
 * alone. Nothing about the tenant is taken from the caller.
 */
export async function requireCardAccess(
  cardId: string,
  permissions: Permissions,
): Promise<CardAccess> {
  const [row] = await db
    .select({
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      position: card.position,
      boardId: board.id,
      teamId: board.teamId,
    })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .innerJoin(board, eq(board.id, boardColumn.boardId))
    .where(eq(card.id, cardId))
    .limit(1);

  if (!row) throw new NotFoundError();

  const access = await requireTeamPermission(row.teamId, permissions);

  return {
    ...access,
    card: {
      id: row.id,
      columnId: row.columnId,
      boardId: row.boardId,
      title: row.title,
      position: row.position,
    },
  };
}
