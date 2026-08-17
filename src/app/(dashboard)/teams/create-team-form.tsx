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
import { createTeam } from "@/lib/actions/organizations";

export function CreateTeamForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setPending(true);
    const result = await createTeam({ organizationId, name: trimmed });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setName("");
    router.push(`/teams/${result.data.teamId}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a team</CardTitle>
        <CardDescription>
          It gets its own board, with To Do, Doing and Done ready to go.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design"
              className="w-56"
            />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create team"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
