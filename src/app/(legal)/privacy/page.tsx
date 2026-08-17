import Link from "next/link";
import type { Metadata } from "next";

import { LegalBlank, hasLegalValue } from "@/components/legal-blank";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Lanes stores and who can see it.",
};

/**
 * Written from the branches that actually ran, in Lanes' own nouns —
 * organisations, teams, boards, columns, cards, members.
 *
 * Every sentence here is allowed only because something in the build performs
 * it. No retention period (nothing prunes the logs), no age limit (nothing
 * asks), no encryption-at-rest or certification claims (nobody provisioned
 * that infrastructure).
 */
export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-sm text-muted-foreground">
        Last updated {legal.lastUpdated}.
      </p>

      <p>
        Lanes is a Kanban board for teams. This page describes what Lanes stores
        about you, who can see it, and what you can do about it. It is operated
        by <LegalBlank field="entity" />.
      </p>

      <h2>What Lanes stores</h2>
      <p>
        Everything below lives in Lanes&apos; own Postgres database. Lanes does
        not buy, sell or enrich personal data, and it runs no advertising.
      </p>
      <ul>
        <li>
          <strong>Your account</strong> — your name, your email address, an
          optional avatar URL, and a hash of your password. Lanes never stores
          the password itself and cannot recover it.
        </li>
        <li>
          <strong>Your organisations and teams</strong> — which organisations
          you belong to, which teams within them, and the role you hold in each
          organisation (owner, admin or member).
        </li>
        <li>
          <strong>Boards, columns and cards</strong> — each team has one board.
          Every card carries a title, an optional description, who it is
          assigned to, an optional due date, and which column it sits in. Lanes
          also records who created a card and when it last changed.
        </li>
        <li>
          <strong>Sessions</strong> — when you sign in, Lanes records the
          session, the IP address it came from and the browser&apos;s
          user-agent string, so you can see and end your signed-in devices.
        </li>
        <li>
          <strong>An activity log</strong> — a line for each change made in the
          app: a card moved, a column renamed, someone joining a team. It
          records the action and the ids involved, never the contents of a
          password or a token.
        </li>
        <li>
          <strong>An email log</strong> — the recipient, subject and delivery
          status of every message Lanes sent you. The body of the message is not
          stored.
        </li>
      </ul>

      <h2>Cookies, and why there is no banner</h2>
      <p>
        Lanes sets one cookie: the session cookie that keeps you signed in. You
        asked to sign in, and the cookie is how that request is honoured, so
        there is nothing here to consent to and no banner to click.
      </p>
      <p>
        Lanes loads no analytics, no session replay, no third-party embeds, no
        advertising or attribution pixels and no A/B testing. If any of those
        are ever added, this page changes and a consent banner comes with them.
      </p>

      <h2>Who can see your work</h2>
      <p>
        A team&apos;s board is visible to the members of that team and to the
        owners and admins of the organisation it belongs to. Your name and
        avatar are visible to them too, because a card shows who it is assigned
        to.
      </p>
      <p>
        <strong>Invite links matter here.</strong> An owner or admin can
        generate a reusable link for a team. Anyone who holds that link can join
        that team and see its board, until the link expires or is revoked. Lanes
        does not check who they are beyond requiring a Lanes account — treat the
        link like a password.
      </p>

      <h2>Who else processes it</h2>
      <ul>
        <li>
          <strong>Postgres</strong> — the database that holds everything above.
        </li>
        <li>
          <strong>Resend</strong> — delivers Lanes&apos; email. Resend sees the
          recipient address and the message. Lanes sends three kinds of message
          and all three are transactional: confirm your email address, reset
          your password, and confirm deleting your account. A password reset is
          not marketing, and Lanes sends no marketing.
        </li>
      </ul>

      <h2>What you can do</h2>
      <ul>
        <li>
          <strong>Correct it</strong> — your name, avatar and email address are
          editable in{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Settings
          </Link>
          , and you can edit any card you can see.
        </li>
        <li>
          <strong>Export it</strong> — &ldquo;Download my data&rdquo; on the
          Account tab returns your profile, your memberships, and the cards you
          created or are assigned, as JSON.
        </li>
        <li>
          <strong>Delete it</strong> — &ldquo;Delete my account&rdquo; on the
          same tab. You confirm by email, and then it is immediate and
          permanent: your profile and your memberships are removed. Cards you
          created stay on their team&apos;s board, unassigned, because they are
          the team&apos;s record of its work rather than yours alone. There is
          no grace period and nothing is recoverable afterwards.
        </li>
      </ul>
      <p>
        If you are the only owner of an organisation, Lanes will not let you
        delete your account until you have made someone else an owner —
        otherwise the organisation would be left with nobody able to run it.
      </p>

      <h2>Security</h2>
      <p>
        Traffic between your browser and Lanes is encrypted in transit.
        Passwords are stored only as hashes. Lanes makes no claim about
        encryption at rest, and holds no security certification.
      </p>

      <h2>Getting in touch</h2>
      <p>
        Privacy questions and requests go to <LegalBlank field="contactEmail" />
        .
      </p>

      {hasLegalValue("jurisdiction") ? null : (
        <p className="text-sm text-muted-foreground">
          {/* The clause that would name a supervisory authority depends
              entirely on a blank, so it is omitted rather than written as a
              sentence that means nothing. */}
          A clause naming the governing jurisdiction and supervisory authority
          has been left out of this page until{" "}
          <code className="font-mono">jurisdiction</code> is set in{" "}
          <code className="font-mono">src/lib/legal.ts</code>.
        </p>
      )}
    </>
  );
}
