import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Lanes account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (error || !token) {
    return (
      <AuthFormShell
        title="That link didn't work"
        subtitle="Reset links expire after an hour and can only be used once."
        footer={
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Send me a new one
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Ask for a fresh link and it&apos;ll arrive in a moment.
        </p>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell
      title="Set a new password"
      subtitle="Pick something you haven't used here before."
      footer={
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthFormShell>
  );
}
