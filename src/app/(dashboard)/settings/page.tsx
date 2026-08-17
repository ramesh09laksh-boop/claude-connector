import type { Metadata } from "next";

import { requireUserOrRedirect } from "@/lib/auth-guards";

import { ProfileCard } from "./profile-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your name and avatar in Lanes.",
};

export default async function ProfileSettingsPage() {
  const session = await requireUserOrRedirect();

  return (
    <ProfileCard
      name={session.user.name}
      image={session.user.image ?? null}
    />
  );
}
