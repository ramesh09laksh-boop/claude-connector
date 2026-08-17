"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

type SessionRow = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  updatedAt?: string | Date;
};

/** "Chrome on Windows" reads; the raw user-agent string does not. */
function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
          ? "Safari"
          : /Firefox\//.test(userAgent)
            ? "Firefox"
            : /curl\//.test(userAgent)
              ? "curl"
              : "Unknown browser";

  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  return os ? `${browser} on ${os}` : browser;
}

export function SessionsCard({
  currentSessionToken,
}: {
  currentSessionToken: string;
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // freshAge: 0 in the auth config is what keeps this working for an account
    // signed in more than 24 hours ago.
    const { data, error } = await authClient.listSessions();
    if (error) {
      setSessions([]);
      return;
    }
    setSessions((data ?? []) as SessionRow[]);
  }, []);

  useEffect(() => {
    // Fetching from an external system on mount. The state lands in a
    // callback once the request resolves, never synchronously in the effect
    // body, so this doesn't cascade a render.
    let cancelled = false;

    void authClient.listSessions().then(({ data, error }) => {
      if (cancelled) return;
      setSessions(error ? [] : ((data ?? []) as SessionRow[]));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onRevoke(token: string) {
    setBusy(token);
    const { error } = await authClient.revokeSession({ token });
    setBusy(null);

    if (error) {
      toast.error(error.message ?? "Couldn't sign that device out.");
      return;
    }
    toast.success("Signed that device out.");
    void load();
  }

  async function onRevokeOthers() {
    setBusy("others");
    const { error } = await authClient.revokeOtherSessions();
    setBusy(null);

    if (error) {
      toast.error(error.message ?? "Couldn't sign the other devices out.");
      return;
    }
    toast.success("Every other device is signed out.");
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>
          Everywhere your account is currently signed in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No other sessions to show.
          </p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => {
              const isCurrent = s.token === currentSessionToken;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {describeDevice(s.userAgent)}
                      {isCurrent ? (
                        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress || "No IP recorded"}
                      {s.updatedAt
                        ? ` · last active ${new Date(s.updatedAt).toLocaleString()}`
                        : null}
                    </p>
                  </div>
                  {isCurrent ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      disabled={busy === s.token}
                      onClick={() => void onRevoke(s.token)}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={busy === "others"}
          onClick={() => void onRevokeOthers()}
        >
          Sign out everywhere else
        </Button>
      </CardContent>
    </Card>
  );
}
