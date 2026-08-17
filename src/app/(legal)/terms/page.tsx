import Link from "next/link";
import type { Metadata } from "next";

import { LegalBlank, hasLegalValue } from "@/components/legal-blank";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms of using Lanes.",
};

/**
 * Shorter than people expect, and it should stay that way. No billing clauses:
 * there are no payments.
 */
export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Terms</h1>
      <p className="text-sm text-muted-foreground">
        Last updated {legal.lastUpdated}.
      </p>

      <p>
        These terms cover your use of Lanes, a Kanban board for teams, operated
        by <LegalBlank field="entity" />. Using Lanes means accepting them.
      </p>

      <h2>What Lanes is</h2>
      <p>
        Lanes gives an organisation teams, and each team one board with columns
        and cards. You sign in with an email address and a password. That is the
        whole of the service — there is no paid tier, and nothing on this page
        is about payment.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password to yourself, and your email address current.</li>
        <li>
          You are responsible for what happens under your account, including
          anyone you hand an invite link to.
        </li>
        <li>One account per person.</li>
      </ul>

      <h2>What you may not do</h2>
      <ul>
        <li>
          Use Lanes to store or share anything unlawful, or anything you have no
          right to share.
        </li>
        <li>
          Try to reach organisations, teams or boards you were not given access
          to.
        </li>
        <li>
          Interfere with the service — automated abuse, attempts to overload it,
          or probing other people&apos;s data.
        </li>
      </ul>

      <h2>Who owns what you put in</h2>
      <p>
        You do. The cards, columns, boards, team names and organisation names
        you create remain yours. Lanes stores and displays them so the service
        can work, and does nothing else with them.
      </p>

      <h2>Organisation data</h2>
      <p>
        An organisation&apos;s owner controls that organisation. They can change
        anyone&apos;s role, remove members, and delete the organisation and its
        boards. Admins can manage teams, columns and people. If you join
        somebody else&apos;s organisation, what you put on its boards is visible
        to them and stays there if you leave.
      </p>

      <h2>Ending it</h2>
      <p>
        You can delete your account at any time from{" "}
        <Link href="/settings/account" className="underline underline-offset-4">
          Settings
        </Link>
        . Deletion is immediate and permanent once confirmed; cards you created
        stay on their team&apos;s board, unassigned. Accounts that break these
        terms may be removed.
      </p>

      <h2>The service can change</h2>
      <p>
        Lanes can be changed, interrupted or withdrawn. It is provided as it is,
        without warranty, and no promise is made that it will always be
        available or free of faults.
      </p>

      {hasLegalValue("jurisdiction") ? (
        <>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the law of{" "}
            <LegalBlank field="jurisdiction" />.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {/* Omitted rather than invented: a governing-law clause with no
              jurisdiction is a sentence that means nothing. */}
          A governing-law clause has been left out until{" "}
          <code className="font-mono">jurisdiction</code> is set in{" "}
          <code className="font-mono">src/lib/legal.ts</code>.
        </p>
      )}

      <h2>Getting in touch</h2>
      <p>
        Questions about these terms go to <LegalBlank field="contactEmail" />.
      </p>
    </>
  );
}
