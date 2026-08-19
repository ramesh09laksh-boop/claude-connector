import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { member, team, teamMember } from "@/lib/db/auth-schema";
import { NotFoundError, requireUser } from "@/lib/auth-guards";
import type { Actor } from "@/lib/actor";
import { isOrgRole, roles, type OrgRole } from "@/lib/permissions";

export { NotFoundError, requireUser };

/**
 * Every read and write in the app goes through this file.
 *
 * Three rules hold everywhere below:
 *
 * 1. The organisation, team and user ids come from the actor or from walking the
 *    ownership chain server-side. The one id a URL legitimately carries is the
 *    `teamId` (or `boardId`, or `cardId`) in the route; everything above it is
 *    resolved here. A `teamId` posted by the client is a value someone can
 *    change in devtools.
 *
 * 2. Failures throw NotFoundError, and pages render notFound(). A 403 on a
 *    resource in another organisation confirms that resource exists. A 404
 *    does not.
 *
 * 3. The `actor` is a parameter, not something this file goes and fetches. There
 *    are two front doors now — the browser's session cookie and the MCP server's
 *    OAuth token — and both are obliged to come through here. See `actor.ts`.
 *    The actor is always constructed from a verified credential; a caller
 *    cannot invent one, which is why `services/` is plain server-only code and
 *    never `"use server"`.
 */

export type Permissions = Record<string, readonly string[]>;

export type OrgAccess = {
  actor: Actor;
  role: OrgRole;
  organizationId: string;
};

/** The actor's role in this organisation, or not-found. */
export async function requireOrgMember(
  actor: Actor,
  organizationId: string,
): Promise<OrgAccess> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, actor.userId),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError();
  // A role string the access-control map doesn't know is not a role. Falling
  // through to "no permissions" would be a quieter bug than refusing outright.
  if (!isOrgRole(row.role)) throw new NotFoundError();

  return { actor, role: row.role, organizationId };
}

/**
 * Membership plus a permission check.
 *
 * The check runs against the role resolved above, server-side. The client-side
 * `checkRolePermission` is for hiding controls; it is presentation, never the
 * boundary.
 *
 * This calls `authorize` directly rather than `auth.api.hasPermission`, which
 * needs request headers an MCP call does not have. It is the same check:
 * `hasPermission` looks the caller's role up in the `member` table and hands it
 * to this very function. `requireOrgMember` has already done that lookup.
 *
 * That equivalence depends on Lanes' roles being static (`ac.newRole` in
 * `permissions.ts`). If organisation roles ever become rows in the database —
 * the organization plugin's dynamic roles — this must go back to
 * `auth.api.hasPermission`, which is the only thing that reads them.
 */
export async function requireOrgPermission(
  actor: Actor,
  organizationId: string,
  permissions: Permissions,
): Promise<OrgAccess> {
  const access = await requireOrgMember(actor, organizationId);

  const allowed = roles[access.role].authorize(permissions);

  if (!allowed.success) {
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
export async function requireTeamAccess(
  actor: Actor,
  teamId: string,
): Promise<TeamAccess> {
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
        eq(member.userId, actor.userId),
      ),
    )
    .limit(1);

  if (!membership) throw new NotFoundError();
  if (!isOrgRole(membership.role)) throw new NotFoundError();

  // Belonging to the organisation is not the same as belonging to the team.
  // Owners and Admins administer every team in their organisation; a Member
  // only sees the teams they were actually added to.
  const role = membership.role;
  if (role === "member") {
    const [onTeam] = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, actor.userId)))
      .limit(1);

    if (!onTeam) throw new NotFoundError();
  }

  if (!row.boardId || !row.boardName) {
    // seedBoardForTeam runs on every team creation, so this means a team row
    // outlived its board — a broken invariant, not a permission problem.
    throw new NotFoundError("This team has no board");
  }

  return {
    actor,
    role,
    organizationId: row.organizationId,
    team: { id: row.teamId, name: row.teamName, organizationId: row.organizationId },
    board: { id: row.boardId, name: row.boardName },
  };
}

export async function requireTeamPermission(
  actor: Actor,
  teamId: string,
  permissions: Permissions,
): Promise<TeamAccess> {
  const access = await requireTeamAccess(actor, teamId);

  const allowed = roles[access.role].authorize(permissions);

  if (!allowed.success) {
    throw new NotFoundError("You don't have permission to do that");
  }

  return access;
}

/** A thin wrapper that resolves the team from the board, then defers upward. */
export async function requireBoardAccess(
  actor: Actor,
  boardId: string,
): Promise<TeamAccess> {
  const [row] = await db
    .select({ teamId: board.teamId })
    .from(board)
    .where(eq(board.id, boardId))
    .limit(1);

  if (!row) throw new NotFoundError();
  return requireTeamAccess(actor, row.teamId);
}

export type ColumnAccess = TeamAccess & {
  column: { id: string; boardId: string; name: string; position: number };
};

/** Walks column → board → team → organisation from the column id alone. */
export async function requireColumnAccess(
  actor: Actor,
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

  const access = await requireTeamPermission(actor, row.teamId, permissions);

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
  actor: Actor,
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

  const access = await requireTeamPermission(actor, row.teamId, permissions);

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
