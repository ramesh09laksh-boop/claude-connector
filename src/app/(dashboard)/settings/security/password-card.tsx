"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Checked by default: changing a password is usually a response to worrying
  // that somebody else has it.
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);

    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: revokeOthers,
    });

    setPending(false);

    if (error) {
      toast.error(error.message ?? "That didn't work. Check your current password.");
      return;
    }

    toast.success(
      revokeOthers
        ? "Password changed, and every other device is signed out."
        : "Password changed.",
    );
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          You&apos;ll need your current one to set a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="revoke-others"
              checked={revokeOthers}
              onCheckedChange={(checked) => setRevokeOthers(checked === true)}
            />
            <Label htmlFor="revoke-others" className="font-normal">
              Sign out my other devices
            </Label>
          </div>

          <Button
            type="submit"
            disabled={
              pending ||
              !currentPassword ||
              newPassword.length < MIN_PASSWORD_LENGTH
            }
          >
            {pending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
