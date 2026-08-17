import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Board } from "@/components/board/board";
import { getAssignableMembers, getBoardState } from "@/lib/boards";
import { NotFoundError, requireTeamAccess } from "@/lib/board-guards";
import type { BoardState } from "@/lib/boards";
import type { OrgRole } from "@/lib/permissions";

// This page renders one team's data and must never be prerendered. A `○` in
// the build's route table would mean a board was baked at build time and is
// served to everyone.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/teams/[teamId]">): Promise<Metadata> {
  const { teamId } = await params;
  try {
    const access = await requireTeamAccess(teamId);
    return { title: access.team.name };
  } catch {
    return { title: "Board" };
  }
}

type BoardPageData = {
  state: BoardState;
  role: OrgRole;
  members: { id: string; name: string; image: string | null }[];
};

/**
 * The guard runs inside the try; the JSX is built outside it. A component
 * constructed inside a try/catch looks guarded and isn't — React renders it
 * later, so a render-time error escapes the catch entirely.
 */
async function loadBoard(teamId: string): Promise<BoardPageData | null> {
  try {
    const access = await requireTeamAccess(teamId);
    const [state, members] = await Promise.all([
      getBoardState(teamId),
      getAssignableMembers(teamId),
    ]);

    if (!state) return null;

    return {
      state,
      role: access.role,
      members: members.map((m) => ({ id: m.id, name: m.name, image: m.image })),
    };
  } catch (cause) {
    // Not-found rather than forbidden: a 403 would confirm that a board in
    // somebody else's organisation exists.
    if (cause instanceof NotFoundError) return null;
    throw cause;
  }
}

export default async function TeamBoardPage({
  params,
}: PageProps<"/teams/[teamId]">) {
  const { teamId } = await params;
  const data = await loadBoard(teamId);

  if (!data) notFound();

  return (
    <Board
      initial={data.state}
      role={data.role}
      teamId={teamId}
      members={data.members}
    />
  );
}
