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
import { retryEmail } from "@/lib/actions/email-retry";

export type EmailLogRow = {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: string;
  error: string | null;
  createdAt: string;
};

/**
 * The panel that answers the most common support question a small app gets —
 * "I never got the email" — with an actual answer: never sent because the key
 * is missing, bounced, or delivered and sitting in spam.
 *
 * The recipient is shown, because an admin needs it to help. The message body
 * is never stored and never shown.
 */
export function EmailLogTable({ rows }: { rows: EmailLogRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function onRetry(id: string) {
    setBusy(id);
    const result = await retryEmail({ emailLogId: id });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Retried — now ${result.data.status}.`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Lanes sent</CardTitle>
        <CardDescription>
          Every message, whether it went out or not. Bodies aren&apos;t stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No email yet. Signing up or resetting a password will put a row
            here.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5">
                <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{row.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.to} · {row.template} ·{" "}
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                  {row.error ? (
                    <p className="mt-0.5 text-xs text-destructive">{row.error}</p>
                  ) : null}
                </div>
                {row.status === "failed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === row.id}
                    onClick={() => void onRetry(row.id)}
                  >
                    {busy === row.id ? "Sending…" : "Resend"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string) {
  if (status === "failed" || status === "bounced" || status === "complained") {
    return "destructive" as const;
  }
  if (status === "sent" || status === "delivered") return "default" as const;
  return "secondary" as const;
}
