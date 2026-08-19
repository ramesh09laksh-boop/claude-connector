import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";
import { carryQuery, oauthResumeUrl } from "@/lib/oauth-resume";
import { safeRedirect } from "@/lib/safe-redirect";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Lanes and pick up where your team left off.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectParam = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;
  const redirectTo = safeRedirect(redirectParam);

  // Someone sent here mid-way through connecting an MCP client arrives with the
  // whole authorize query attached. See lib/oauth-resume.ts.
  const resumeTo = oauthResumeUrl(params);

  // Carry the authorize query across, so someone who needs an account first
  // still lands back in the flow they started.
  const signUpHref = resumeTo
    ? `/sign-up?${carryQuery(params)}`
    : redirectTo === "/dashboard"
      ? "/sign-up"
      : `/sign-up?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthFormShell
      title={resumeTo ? "Sign in to continue" : "Welcome back"}
      subtitle={
        resumeTo
          ? "Sign in, then choose whether to give the application access."
          : "Sign in to see your team's board."
      }
      footer={
        <>
          New to Lanes?{" "}
          <Link href={signUpHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm redirectTo={redirectTo} resumeTo={resumeTo} />
    </AuthFormShell>
  );
}
