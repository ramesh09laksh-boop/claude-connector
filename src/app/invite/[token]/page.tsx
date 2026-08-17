import Link from "next/link";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { member, teamMember } from "@/lib/db/auth-schema";
import { getOptionalUser } from "@/lib/auth-guards";
import { resolveInviteToken } from "@/lib/invites";

import { JoinButton } from "./join-button";

export const dynamic = "force-dynamic";

// An invite link is a bearer credential. Keeping the page out of search is one
// of the three things that follow from that (the others: it never appears in a
// log, and the token is compared in full).
export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

function InviteShell({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 px-6 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Lanes
      </Link>
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </main>
  );
}

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await resolveInviteToken(token);

  // Each branch gets its own readable screen — never a raw error.
  if (invite.status === "unknown") {
    return (
      <InviteShell
        title="This invite link isn't valid"
        body="Double-check the link, or ask whoever sent it for a new one."
        action={
          <Button render={<Link href="/" />} nativeButton={false} variant="outline">
            Go to Lanes
          </Button>
        }
      />
    );
  }

  if (invite.status === "revoked") {
    return (
      <InviteShell
        title="This invite has been revoked"
        body="Someone in the team turned this link off. Ask them for a new one."
      />
    );
  }

  if (invite.status === "expired") {
    return (
      <InviteShell
        title="This invite has expired"
        body="Invite links last a few days. Ask for a new one and you're in."
      />
    );
  }

  const session = await getOptionalUser();

  if (!session) {
    const back = encodeURIComponent(`/invite/${token}`);
    return (
      <InviteShell
        title={`Join ${invite.teamName}`}
        body={`You've been invited to the ${invite.teamName} team at ${invite.organizationName}, as a ${invite.role}. Sign in or create an account and you'll come straight back here.`}
        action={
          <div className="flex justify-center gap-2">
            <Button render={<Link href={`/sign-up?redirect=${back}`} />} nativeButton={false}>
              Create an account
            </Button>
            <Button
              render={<Link href={`/sign-in?redirect=${back}`} />}
              nativeButton={false}
              variant="outline"
            >
              Sign in
            </Button>
          </div>
        }
      />
    );
  }

  const [alreadyInOrg] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, invite.organizationId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);

  const [alreadyOnTeam] = await db
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(
      and(
        eq(teamMember.teamId, invite.teamId),
        eq(teamMember.userId, session.user.id),
      ),
    )
    .limit(1);

  // Already in? Say so and send them to the board — not an error.
  if (alreadyInOrg && alreadyOnTeam) {
    return (
      <InviteShell
        title="You're already in this team"
        body={`${invite.teamName} at ${invite.organizationName} is already yours to work in.`}
        action={
          <Button render={<Link href={`/teams/${invite.teamId}`} />} nativeButton={false}>
            Go to the board
          </Button>
        }
      />
    );
  }

  return (
    <InviteShell
      title={`Join ${invite.teamName} at ${invite.organizationName}`}
      body={`You'll join as a ${invite.role}. ${
        invite.role === "member"
          ? "You'll be able to create, edit and move cards."
          : "You'll be able to manage the board and the people on it."
      }`}
      action={<JoinButton token={token} />}
    />
  );
}
