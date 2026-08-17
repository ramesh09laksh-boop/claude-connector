import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";
import { safeRedirect } from "@/lib/safe-redirect";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Lanes and pick up where your team left off.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = safeRedirect(redirect);

  const signUpHref =
    redirectTo === "/dashboard"
      ? "/sign-up"
      : `/sign-up?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthFormShell
      title="Welcome back"
      subtitle="Sign in to see your team's board."
      footer={
        <>
          New to Lanes?{" "}
          <Link href={signUpHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm redirectTo={redirectTo} />
    </AuthFormShell>
  );
}
