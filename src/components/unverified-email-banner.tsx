"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

/**
 * A nag, not a lock.
 *
 * The app stays usable with an unconfirmed address — only creating invite
 * links is gated, because that is the one action that would embarrass someone
 * from an address nobody has confirmed. Blocking sign-in instead turns one
 * mistyped address into a support request the user cannot answer.
 */
export function UnverifiedEmailBanner() {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

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
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: "",
      callbackURL: "/dashboard",
    });
    setSending(false);

    if (error) {
      // A rate-limit rejection carries how long to wait; honour it rather than
      // inventing our own number.
      const retryAfter = Number(
        (error as { headers?: Headers }).headers?.get?.("X-Retry-After") ?? 0,
      );
      startCooldown(retryAfter > 0 ? retryAfter : COOLDOWN_SECONDS);
      toast.error(
        retryAfter > 0
          ? `Hold on ${retryAfter} seconds before asking again.`
          : "Couldn't send that just now. Try again in a minute.",
      );
      return;
    }

    startCooldown(COOLDOWN_SECONDS);
    toast.success("Sent — check your inbox for the confirmation link.");
  }

  return (
    <div className="border-b bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <span>
          Confirm your email address to start inviting people to your teams.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 bg-transparent"
          onClick={() => void onResend()}
          disabled={sending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the email"}
        </Button>
      </div>
    </div>
  );
}
