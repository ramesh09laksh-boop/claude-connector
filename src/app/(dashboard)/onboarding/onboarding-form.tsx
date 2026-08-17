"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganizationWithTeam } from "@/lib/actions/organizations";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState(defaultName);
  const [teamName, setTeamName] = useState("Engineering");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await createOrganizationWithTeam({
      organizationName: organizationName.trim(),
      teamName: teamName.trim(),
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    router.push(`/teams/${result.data.teamId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="organizationName">Organisation name</Label>
        <Input
          id="organizationName"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          placeholder="Acme Corp"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="teamName">Your first team</Label>
        <Input
          id="teamName"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Engineering"
          required
        />
        <p className="text-xs text-muted-foreground">
          You can add more teams later. Each one gets its own board.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Setting things up…" : "Create organisation"}
      </Button>
    </form>
  );
}
