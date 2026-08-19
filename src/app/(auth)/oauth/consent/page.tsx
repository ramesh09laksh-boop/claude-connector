import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/db/auth-schema";
import { getOptionalUser } from "@/lib/auth-guards";

import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authorise access",
  description: "Give an application access to your Lanes account.",
  // Never index a page that only exists inside an OAuth redirect.
  robots: { index: false, follow: false },
};

/**
 * The consent screen for `/mcp`'s OAuth flow.
 *
 * Better Auth's authorize endpoint sends the user here with `consent_code`,
 * `client_id` and `scope`, having already established who they are. Accepting
 * posts the code back to `/api/auth/oauth2/consent`, which mints the
 * authorization code and returns where to send the browser next.
 */

/**
 * Plain-language names for the scopes this server issues. An unknown scope is
 * shown verbatim rather than hidden — a consent screen that quietly omits what
 * it doesn't recognise is worse than one that looks slightly technical.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected without asking you to sign in again",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    consent_code?: string;
    client_id?: string;
    scope?: string;
  }>;
}) {
  const { consent_code: consentCode, client_id: clientId, scope } = await searchParams;

  // Reaching this page signed out means the flow was interrupted or the URL was
  // shared. There is nothing to consent to without an identity.
  const session = await getOptionalUser();
  if (!session) redirect("/sign-in");

  if (!consentCode || !clientId) {
    return (
      <AuthFormShell
        title="Nothing to authorise"
        subtitle="This link is incomplete or has already been used."
        footer={
          <Link href="/dashboard" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to Lanes
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Start again from the application you were connecting.
        </p>
      </AuthFormShell>
    );
  }

  const [client] = await db
    .select({
      name: oauthApplication.name,
      redirectUrls: oauthApplication.redirectUrls,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1);

  const clientName = client?.name?.trim() || "An application";

  /**
   * The hostnames the authorization code would be sent to.
   *
   * Shown because the MCP authorization spec requires it: a client registered
   * dynamically can call itself anything, and on a loopback redirect any local
   * process can claim to be Claude. The hostname is the part that cannot be
   * faked, so it is the part the person approving this needs to see.
   */
  const redirectHosts = Array.from(
    new Set(
      (client?.redirectUrls ?? "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => {
          try {
            return new URL(url).host;
          } catch {
            return url;
          }
        }),
    ),
  );

  const isLoopbackOnly =
    redirectHosts.length > 0 &&
    redirectHosts.every((host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host));

  const scopes = (scope ?? "")
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <AuthFormShell
      title="Authorise access"
      subtitle={`${clientName} wants to use your Lanes account.`}
      footer={
        <>
          Signed in as {session.user.email}.{" "}
          <Link href="/dashboard" className="font-medium text-foreground underline-offset-4 hover:underline">
            Not you?
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">It will be able to:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {scopes.length > 0 ? (
              scopes.map((s) => (
                <li key={s}>• {SCOPE_LABELS[s] ?? s}</li>
              ))
            ) : (
              <li>• Confirm who you are</li>
            )}
            <li>• Read and change the boards, columns and cards on your teams</li>
          </ul>
        </div>

        {redirectHosts.length > 0 ? (
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">You will be sent back to</p>
            <p className="text-sm break-all text-muted-foreground">
              {redirectHosts.join(", ")}
            </p>
            {isLoopbackOnly ? (
              <p className="text-xs text-muted-foreground">
                This is an application running on your own computer. Only continue
                if you just started it yourself.
              </p>
            ) : null}
          </div>
        ) : null}

        <ConsentForm consentCode={consentCode} clientName={clientName} />
      </div>
    </AuthFormShell>
  );
}
