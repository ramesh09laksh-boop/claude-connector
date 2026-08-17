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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { exportMyData, type AccountFootprint } from "@/lib/actions/account";

export function DangerZone({
  email,
  footprint,
}: {
  email: string;
  footprint: AccountFootprint | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const blocked = (footprint?.soleOwnerOf.length ?? 0) > 0;

  async function onExport() {
    setExporting(true);
    const result = await exportMyData();
    setExporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const blob = new Blob([result.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lanes-my-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete() {
    setPending(true);
    const { error } = await authClient.deleteUser({
      password,
      callbackURL: "/goodbye",
    });
    setPending(false);

    if (error) {
      toast.error(error.message ?? "Couldn't delete the account.");
      return;
    }

    toast.success("Check your email for the confirmation link.");
    setOpen(false);
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete my account</CardTitle>
        <CardDescription>
          Deletion is immediate and permanent once you confirm it by email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {footprint
            ? `You'll be removed from ${footprint.organizations} ${
                footprint.organizations === 1 ? "organisation" : "organisations"
              } and ${footprint.teams} ${
                footprint.teams === 1 ? "team" : "teams"
              }. Cards you created stay on their boards, unassigned.`
            : "Cards you created stay on their boards, unassigned."}
        </p>

        {blocked ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            You&apos;re the only owner of{" "}
            <strong>{footprint?.soleOwnerOf.join(", ")}</strong>. Make someone
            else an owner first, or the organisation would be left with nobody
            able to run it.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {/* Offered first, deliberately — before the button that ends it. */}
          <Button variant="outline" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? "Preparing…" : "Download my data"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            disabled={blocked}
          >
            Delete my account
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your Lanes account?</DialogTitle>
            <DialogDescription>
              {footprint
                ? `This removes your profile and takes you out of ${footprint.organizations} ${
                    footprint.organizations === 1
                      ? "organisation"
                      : "organisations"
                  } and ${footprint.teams} ${
                    footprint.teams === 1 ? "team" : "teams"
                  }. Cards you created stay on their boards, unassigned.`
                : "This removes your profile and your memberships."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {/* Typing the address is harder to do by reflex than typing
                  "DELETE", and it restates whose account this is. */}
              <Label htmlFor="confirm-email">
                Type <span className="font-mono">{email}</span> to continue
              </Label>
              <Input
                id="confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Your password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              disabled={pending || confirmEmail !== email || !password}
              onClick={() => void onDelete()}
            >
              {pending ? "Sending…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
