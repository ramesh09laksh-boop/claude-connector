import { requireUser } from "@/lib/auth-guards";
import { isPlatformAdmin } from "@/lib/auth";

import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";

/**
 * Inside the dashboard group, so it inherits the sign-in check written once in
 * that layout. One route per section, one Card per concern, each card with its
 * own save button — never one giant form with a single Save.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();
  // Hiding the System link is presentation; the page itself calls
  // requireAdmin() on the server.
  const admin = await isPlatformAdmin(session.user.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-muted-foreground">
        Your profile, your account and how you sign in.
      </p>
      <SettingsNav showSystem={admin} />
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}
