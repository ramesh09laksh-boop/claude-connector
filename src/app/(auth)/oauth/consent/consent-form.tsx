"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Approve or refuse, then follow the server's answer.
 *
 * `/api/auth/oauth2/consent` replies with `{ redirectURI }` — the client's own
 * callback, carrying the authorization code. That is deliberately an *external*
 * URL (Claude's is `https://claude.ai/api/mcp/auth_callback`), so this uses
 * `window.location` rather than the router, and `safeRedirect` must not be
 * applied to it: Better Auth already checked the URI against the one the client
 * registered, and rejecting off-origin here would break every real client.
 */
export function ConsentForm({
  consentCode,
  clientName,
}: {
  consentCode: string;
  clientName: string;
}) {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setError(null);
    setPending(accept ? "accept" : "deny");

    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same-origin, so the signed consent cookie travels too; sending the
        // code explicitly means the flow still works if that cookie was dropped.
        credentials: "include",
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });

      const data: unknown = await response.json().catch(() => null);
      const redirectURI =
        data && typeof data === "object" && "redirectURI" in data
          ? String((data as { redirectURI: unknown }).redirectURI)
          : null;

      if (!response.ok || !redirectURI) {
        setPending(null);
        setError(
          "That didn't work. The request may have expired — start again from " +
            `${clientName}.`,
        );
        return;
      }

      // Deliberately a full navigation, not router.push: this leaves Lanes.
      window.location.href = redirectURI;
    } catch {
      setPending(null);
      setError("Couldn't reach Lanes. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={pending !== null}
        onClick={() => decide(true)}
      >
        {pending === "accept" ? "Authorising…" : "Authorise"}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending !== null}
        onClick={() => decide(false)}
      >
        {pending === "deny" ? "Cancelling…" : "Cancel"}
      </Button>
    </div>
  );
}
