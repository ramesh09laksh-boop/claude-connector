import type { Metadata } from "next";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { emailConfigured } from "@/lib/email";
import { getAccountFootprint } from "@/lib/actions/account";

import { EmailCard } from "./email-card";
import { DangerZone } from "./danger-zone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  description: "Your email address, and leaving Lanes.",
};

export default async function AccountSettingsPage() {
  const session = await requireUserOrRedirect();
  const footprint = await getAccountFootprint();

  return (
    <>
      <EmailCard
        email={session.user.email}
        emailVerified={session.user.emailVerified}
        emailConfigured={emailConfigured}
      />

      {/* Real whitespace above the danger zone, and a visually distinct card. */}
      <div className="pt-8">
        <DangerZone
          email={session.user.email}
          footprint={footprint.ok ? footprint.data : null}
        />
      </div>
    </>
  );
}
