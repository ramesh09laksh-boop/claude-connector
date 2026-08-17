import type { Metadata } from "next";

import { requireUser } from "@/lib/auth-guards";

import { ProfileCard } from "./profile-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your name and avatar in Lanes.",
};

export default async function ProfileSettingsPage() {
  const session = await requireUser();

  return (
    <ProfileCard
      name={session.user.name}
      image={session.user.image ?? null}
    />
  );
}
