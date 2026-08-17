import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";
import { safeRedirect } from "@/lib/safe-redirect";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Lanes account and start a board for your team.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = safeRedirect(redirect);

  const signInHref =
    redirectTo === "/dashboard"
      ? "/sign-in"
      : `/sign-in?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthFormShell
      title="Get your team on one board"
      subtitle="Create an organisation, add a team, and start moving cards."
      footer={
        <>
          Already have an account?{" "}
          <Link href={signInHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm redirectTo={redirectTo} />
    </AuthFormShell>
  );
}
