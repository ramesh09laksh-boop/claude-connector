import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";
import { carryQuery, oauthResumeUrl } from "@/lib/oauth-resume";
import { safeRedirect } from "@/lib/safe-redirect";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Lanes account and start a board for your team.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectParam = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;
  const redirectTo = safeRedirect(redirectParam);

  // Signing up can also be the middle of connecting an MCP client, for someone
  // who had no account yet. See lib/oauth-resume.ts.
  const resumeTo = oauthResumeUrl(params);

  const signInHref = resumeTo
    ? `/sign-in?${carryQuery(params)}`
    : redirectTo === "/dashboard"
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
      <SignUpForm redirectTo={redirectTo} resumeTo={resumeTo} />
    </AuthFormShell>
  );
}
