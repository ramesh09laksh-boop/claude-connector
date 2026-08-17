import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { db } from "@/lib/db";
import { member } from "@/lib/db/auth-schema";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your organisation",
  description: "Set up your organisation and your first team in Lanes.",
};

export default async function OnboardingPage() {
  const session = await requireUserOrRedirect();

  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1);

  if (existing.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Create your organisation
      </h1>
      <p className="mt-2 text-muted-foreground">
        An organisation holds your teams. Each team gets one board, and
        we&apos;ll start yours with To Do, Doing and Done.
      </p>
      <div className="mt-8">
        <OnboardingForm defaultName={suggestOrgName(session.user.name)} />
      </div>
    </div>
  );
}

function suggestOrgName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first ? `${first}'s organisation` : "";
}
