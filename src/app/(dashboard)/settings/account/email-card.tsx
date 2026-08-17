"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

export function EmailCard({
  email,
  emailVerified,
  emailConfigured,
}: {
  email: string;
  emailVerified: boolean;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [changing, setChanging] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    const timer = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function onResend() {
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/settings/account",
    });
    setResending(false);

    if (error) {
      const retryAfter = Number(
        (error as { headers?: Headers }).headers?.get?.("X-Retry-After") ?? 0,
      );
      startCooldown(retryAfter > 0 ? retryAfter : COOLDOWN_SECONDS);
      toast.error(
        retryAfter > 0
          ? `Hold on ${retryAfter} seconds before asking again.`
          : "Couldn't send that just now.",
      );
      return;
    }

    startCooldown(COOLDOWN_SECONDS);
    toast.success("Sent — check your inbox.");
  }

  async function onChangeEmail(event: React.FormEvent) {
    event.preventDefault();
    setChanging(true);

    const { error } = await authClient.changeEmail({
      newEmail: newEmail.trim(),
      callbackURL: "/settings/account",
    });

    setChanging(false);

    if (error) {
      toast.error(error.message ?? "Couldn't start that change.");
      return;
    }

    // Deliberately "check your new inbox", never "email changed": Better Auth
    // returns success even when the address belongs to somebody else, so that
    // this page can't be used to discover who has an account.
    toast.success("Check your new inbox for a confirmation link.");
    setNewEmail("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          Where password resets and confirmations go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{email}</span>
          {emailVerified ? (
            <Badge>Confirmed</Badge>
          ) : (
            <Badge variant="secondary">Not confirmed yet</Badge>
          )}
          {/* The resend control appears only when it's needed and disappears
              entirely once confirmed — the endpoint returns 400 for an
              already-verified user, and surfacing that where a success message
              belongs is just confusing. */}
          {emailVerified ? null : (
            <Button
              size="sm"
              variant="outline"
              disabled={resending || cooldown > 0}
              onClick={() => void onResend()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation"}
            </Button>
          )}
        </div>

        {emailConfigured ? null : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Email isn&apos;t configured yet, so messages print to the server
            terminal instead of being delivered. Set <code>RESEND_API_KEY</code>{" "}
            to send them for real.
          </p>
        )}

        <form onSubmit={onChangeEmail} className="space-y-3 border-t pt-6">
          <div className="space-y-2">
            <Label htmlFor="new-email">Change to a different email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.org"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send a confirmation link to the new address. Nothing
              changes until you click it.
            </p>
          </div>
          <Button type="submit" disabled={changing || !newEmail.trim()}>
            {changing ? "Sending…" : "Send confirmation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
