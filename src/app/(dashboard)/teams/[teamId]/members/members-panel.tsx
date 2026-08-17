"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInviteLink, revokeInviteLink } from "@/lib/actions/invites";
import { changeMemberRole, removeMember } from "@/lib/actions/organizations";
import { orgRoles, roleRank, type OrgRole } from "@/lib/permissions";
import type { TeamMemberSummary } from "@/lib/boards";

type InviteLinkView = {
  id: string;
  role: string;
  useCount: number;
  expiresAt: string;
  url: string;
};

export function MembersPanel({
  teamId,
  viewerId,
  viewerRole,
  emailVerified,
  members,
  links,
}: {
  teamId: string;
  viewerId: string;
  viewerRole: OrgRole;
  emailVerified: boolean;
  members: TeamMemberSummary[];
  links: InviteLinkView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<OrgRole>("member");
  const [days, setDays] = useState("7");

  // An Admin can only mint a link at or below their own level, which is the
  // check that stops them handing themselves the organisation.
  const grantableRoles = orgRoles.filter(
    (role) => roleRank(role) >= roleRank(viewerRole),
  );

  async function onCreateLink() {
    setBusy("create");
    const result = await createInviteLink({
      teamId,
      role: newRole,
      expiresInDays: Number(days) || 7,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Invite link ready — copy it and paste it wherever.");
    router.refresh();
  }

  async function onRevoke(linkId: string) {
    setBusy(linkId);
    const result = await revokeInviteLink({ linkId });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Revoked. That link stops working for everyone.");
    router.refresh();
  }

  async function onChangeRole(userId: string, role: OrgRole) {
    setBusy(userId);
    const result = await changeMemberRole({ teamId, userId, role });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Role updated.");
    router.refresh();
  }

  async function onRemove(userId: string) {
    setBusy(userId);
    const result = await removeMember({ teamId, userId });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Removed from the organisation.");
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite link</CardTitle>
          <CardDescription>
            Anyone who opens this link joins the team with the role you pick.
            Treat it like a password — whoever holds it can get in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {links.length > 0 ? (
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
                      Joins as {link.role}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Used {link.useCount}{" "}
                      {link.useCount === 1 ? "time" : "times"} · expires{" "}
                      {new Date(link.expiresAt).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      disabled={busy === link.id}
                      onClick={() => void onRevoke(link.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input readOnly value={link.url} className="font-mono text-xs" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(link.url);
                        toast.success("Copied.");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No live invite link for this team yet.
            </p>
          )}

          {emailVerified ? (
            <div className="flex flex-wrap items-end gap-3 border-t pt-5">
              <div className="space-y-2">
                <Label htmlFor="invite-role">They join as</Label>
                <Select
                  value={newRole}
                  onValueChange={(value) =>
                    setNewRole((value as OrgRole) ?? "member")
                  }
                >
                  <SelectTrigger id="invite-role" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {grantableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-days">Expires in (days)</Label>
                <Input
                  id="invite-days"
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-28"
                />
              </div>
              <Button disabled={busy === "create"} onClick={() => void onCreateLink()}>
                {busy === "create" ? "Creating…" : "Create link"}
              </Button>
              {links.length > 0 ? (
                <p className="w-full text-xs text-muted-foreground">
                  Creating a new link for a role revokes the previous one.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Confirm your email address before creating invite links.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            Everyone in this organisation and what they can do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((person) => {
              const isSelf = person.id === viewerId;
              // An Admin cannot touch an Owner.
              const canManage =
                !isSelf && roleRank(person.role as OrgRole) >= roleRank(viewerRole);

              return (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {person.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.email}
                    </p>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {canManage ? (
                      <Select
                        value={person.role}
                        onValueChange={(value) =>
                          void onChangeRole(person.id, (value as OrgRole) ?? "member")
                        }
                        disabled={busy === person.id}
                      >
                        <SelectTrigger className="w-32" aria-label={`Role for ${person.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {grantableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="rounded bg-secondary px-2 py-1 text-xs font-medium">
                        {person.role}
                      </span>
                    )}

                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy === person.id}
                        onClick={() => void onRemove(person.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
