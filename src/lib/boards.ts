import "server-only";

import { and, asc, count, eq, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { board, boardColumn, card } from "@/lib/db/schema";
import { member, team, teamMember, user } from "@/lib/db/auth-schema";

export type BoardCard = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  position: number;
  assignee: { id: string; name: string; image: string | null } | null;
};

export type BoardColumnState = {
  id: string;
  name: string;
  position: number;
  cards: BoardCard[];
};

export type BoardState = {
  boardId: string;
  boardName: string;
  teamId: string;
  teamName: string;
  columns: BoardColumnState[];
  version: string;
};

/**
 * One function, one shape, two callers — the board's server component and the
 * polling route. Two rendering paths over two slightly different shapes is how
 * a board starts disagreeing with itself.
 *
 * Two queries regardless of how many columns the board has: one for the
 * columns, one for every card on the board joined to its assignee. No N+1.
 */
export async function getBoardState(teamId: string): Promise<BoardState | null> {
  const [head] = await db
    .select({
      boardId: board.id,
      boardName: board.name,
      teamId: team.id,
      teamName: team.name,
    })
    .from(board)
    .innerJoin(team, eq(team.id, board.teamId))
    .where(eq(board.teamId, teamId))
    .limit(1);

  if (!head) return null;

  const columns = await db
    .select({
      id: boardColumn.id,
      name: boardColumn.name,
      position: boardColumn.position,
    })
    .from(boardColumn)
    .where(eq(boardColumn.boardId, head.boardId))
    .orderBy(asc(boardColumn.position));

  const cards = await db
    .select({
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      description: card.description,
      dueDate: card.dueDate,
      position: card.position,
      assigneeId: user.id,
      assigneeName: user.name,
      assigneeImage: user.image,
    })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .leftJoin(user, eq(user.id, card.assigneeId))
    .where(eq(boardColumn.boardId, head.boardId))
    .orderBy(asc(card.position));

  const byColumn = new Map<string, BoardCard[]>();
  for (const c of cards) {
    const list = byColumn.get(c.columnId) ?? [];
    list.push({
      id: c.id,
      columnId: c.columnId,
      title: c.title,
      description: c.description,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      position: c.position,
      assignee: c.assigneeId
        ? { id: c.assigneeId, name: c.assigneeName ?? "", image: c.assigneeImage }
        : null,
    });
    byColumn.set(c.columnId, list);
  }

  return {
    boardId: head.boardId,
    boardName: head.boardName,
    teamId: head.teamId,
    teamName: head.teamName,
    columns: columns.map((col) => ({
      ...col,
      cards: (byColumn.get(col.id) ?? []).sort((a, b) => a.position - b.position),
    })),
    version: await getBoardStateVersion(teamId),
  };
}

/**
 * A cheap "has anything changed?" token: the newest card timestamp plus the
 * card and column counts. Counts are in there because a delete moves no
 * timestamp forward — without them, removing a card would look like no change.
 */
export async function getBoardStateVersion(teamId: string): Promise<string> {
  const [head] = await db
    .select({ boardId: board.id })
    .from(board)
    .where(eq(board.teamId, teamId))
    .limit(1);

  if (!head) return "0:0:0";

  const [cardStats] = await db
    .select({ latest: max(card.updatedAt), n: count() })
    .from(card)
    .innerJoin(boardColumn, eq(boardColumn.id, card.columnId))
    .where(eq(boardColumn.boardId, head.boardId));

  const [columnStats] = await db
    .select({ n: count() })
    .from(boardColumn)
    .where(eq(boardColumn.boardId, head.boardId));

  const latest = cardStats?.latest ? cardStats.latest.getTime() : 0;
  return `${latest}:${cardStats?.n ?? 0}:${columnStats?.n ?? 0}`;
}

export type TeamMemberSummary = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  onTeam: boolean;
};

/**
 * Who can be assigned a card on this team's board.
 *
 * Accepting any user id would let someone assign a card to a stranger and leak
 * that person's name onto the board, so the assignee select and the server-side
 * check both read from here.
 */
export async function getTeamMembers(
  teamId: string,
): Promise<TeamMemberSummary[]> {
  const [head] = await db
    .select({ organizationId: team.organizationId })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);

  if (!head) return [];

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      teamMemberId: teamMember.id,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(
      teamMember,
      and(eq(teamMember.userId, member.userId), eq(teamMember.teamId, teamId)),
    )
    .where(eq(member.organizationId, head.organizationId))
    .orderBy(asc(user.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    role: row.role,
    onTeam: row.teamMemberId !== null || row.role !== "member",
  }));
}

/** Just the people who may be assigned a card — org admins count, as they can see the board. */
export async function getAssignableMembers(teamId: string) {
  const members = await getTeamMembers(teamId);
  return members.filter((m) => m.onTeam);
}
