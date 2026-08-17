"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);

    await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });

    setPending(false);
    // The same message either way — saying "no account with that email" would
    // let anyone test which addresses are registered.
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm">
        If <strong>{email.trim()}</strong> has a Lanes account, a reset link is
        on its way. It expires in an hour.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending || !email.trim()}>
        {pending ? "Sending…" : "Send the reset link"}
      </Button>
    </form>
  );
}
