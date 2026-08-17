import type { Metadata } from "next";

import { requireUser } from "@/lib/auth-guards";

import { PasswordCard } from "./password-card";
import { SessionsCard } from "./sessions-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security",
  description: "Your password and the devices you're signed in on.",
};

export default async function SecuritySettingsPage() {
  const session = await requireUser();

  return (
    <>
      <PasswordCard />
      <SessionsCard currentSessionToken={session.session.token} />
    </>
  );
}
