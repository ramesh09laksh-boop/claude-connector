"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { acceptInviteLink } from "@/lib/actions/invites";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    // Guard the double-click here too; the action is idempotent, but there is
    // no reason to send the second request.
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await acceptInviteLink({ token });

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    router.push(`/teams/${result.data.teamId}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => void onJoin()} disabled={pending}>
        {pending ? "Joining…" : "Join the team"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
