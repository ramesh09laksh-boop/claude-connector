import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getTeamMembers, type TeamMemberSummary } from "@/lib/boards";
import { NotFoundError, requireTeamAccess } from "@/lib/board-guards";
import { UnauthenticatedError } from "@/lib/auth-guards";
import { getActiveInviteLinks } from "@/lib/invites";
import { siteUrl } from "@/lib/site";
import type { OrgRole } from "@/lib/permissions";

import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Members",
  description: "Who's in this team, and the link that lets people join it.",
};

type MembersPageData = {
  teamName: string;
  viewerId: string;
  viewerRole: OrgRole;
  emailVerified: boolean;
  members: TeamMemberSummary[];
  links: {
    id: string;
    role: string;
    useCount: number;
    expiresAt: string;
    url: string;
  }[];
};

/** Guards inside the try, JSX outside it — see the note on the board page. */
async function loadMembers(teamId: string): Promise<MembersPageData | null> {
  try {
    const access = await requireTeamAccess(teamId);

    // Owner/Admin only. A Member reaching this URL gets the same not-found they
    // would get for a team in another organisation.
    if (access.role === "member") return null;

    const [members, links] = await Promise.all([
      getTeamMembers(teamId),
      getActiveInviteLinks(teamId),
    ]);

    return {
      teamName: access.team.name,
      viewerId: access.session.user.id,
      viewerRole: access.role,
      emailVerified: access.session.user.emailVerified,
      members,
      links: links.map((link) => ({
        id: link.id,
        role: link.role,
        useCount: link.useCount,
        expiresAt: link.expiresAt.toISOString(),
        url: `${siteUrl}/invite/${link.token}`,
      })),
    };
  } catch (cause) {
    // Same reasoning as the board page: not-found rather than forbidden, and a
    // signed-out visitor is already being redirected by the layout above.
    if (cause instanceof NotFoundError || cause instanceof UnauthenticatedError) {
      return null;
    }
    throw cause;
  }
}

export default async function MembersPage({
  params,
}: PageProps<"/teams/[teamId]/members">) {
  const { teamId } = await params;
  const data = await loadMembers(teamId);

  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{data.teamName}</h1>
      <p className="mt-1 text-muted-foreground">
        Who&apos;s in this team, and how new people get in.
      </p>

      <MembersPanel
        teamId={teamId}
        viewerId={data.viewerId}
        viewerRole={data.viewerRole}
        emailVerified={data.emailVerified}
        members={data.members}
        links={data.links}
      />
    </div>
  );
}
