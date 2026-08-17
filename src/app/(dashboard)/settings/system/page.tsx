import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { activityLog, emailLog } from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";
import {
  NotFoundError,
  UnauthenticatedError,
  requireAdmin,
} from "@/lib/auth-guards";
import { getSystemChecks } from "@/lib/system-status";

import { EmailLogTable } from "./email-log-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System",
  description: "What's configured, what's happened, and what email went out.",
};

/** True when the caller is a platform admin; false for a clean refusal. */
async function isAdminViewer(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch (cause) {
    // Not an admin, and not signed in at all, both mean "you don't see this".
    // A signed-out visitor is redirected by the dashboard layout above; without
    // catching the unauthenticated case here, that redirect still wins but the
    // throw is logged as an error on every signed-out request.
    if (cause instanceof NotFoundError || cause instanceof UnauthenticatedError) {
      return false;
    }
    throw cause;
  }
}

export default async function SystemPage() {
  // Refused by the server, not merely hidden. `notFound()` answers 404 rather
  // than 200 — a 200 here would say "this page exists, you just can't have it"
  // — while the sibling not-found.tsx keeps it a readable page rather than the
  // stack trace a bare throw would render.
  if (!(await isAdminViewer())) notFound();

  const checks = await getSystemChecks();

  const activity = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      detail: activityLog.detail,
      createdAt: activityLog.createdAt,
      userName: user.name,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.userId))
    .orderBy(desc(activityLog.createdAt))
    // This table grows; the page reads the last few hundred rows.
    .limit(200);

  const emails = await db
    .select({
      id: emailLog.id,
      to: emailLog.to,
      subject: emailLog.subject,
      template: emailLog.template,
      status: emailLog.status,
      error: emailLog.error,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .orderBy(desc(emailLog.createdAt))
    .limit(100);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>What&apos;s configured</CardTitle>
          <CardDescription>
            &ldquo;Not configured yet&rdquo; is a normal state here, not an
            error. Lanes only ever shows the <em>name</em> of a setting, never
            its value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {checks.map((check) => (
              <li key={check.name} className="flex flex-wrap gap-3 py-3">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    check.ok ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {check.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      — {check.ok ? "configured" : "not configured yet"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set <code className="font-mono">{check.hint}</code>
                    {check.detail ? ` · ${check.detail}` : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s happened</CardTitle>
          <CardDescription>
            Every write, newest first. Reads aren&apos;t logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Create a card and it&apos;ll show up here.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {activity.map((row) => (
                <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5">
                  <code className="font-mono text-xs text-muted-foreground">
                    {row.action}
                  </code>
                  <span className="min-w-0 flex-1 truncate">
                    {describeActivity(row.action, row.detail)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.userName ?? "a deleted account"} ·{" "}
                    {row.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EmailLogTable
        rows={emails.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </>
  );
}

/** Plain language, from the ids and field names the log actually carries. */
function describeActivity(action: string, detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  const str = (key: string) =>
    typeof d[key] === "string" ? (d[key] as string) : undefined;

  switch (action) {
    case "card.moved":
      return `moved “${str("title") ?? "a card"}” to another column`;
    case "card.created":
      return `added “${str("title") ?? "a card"}”`;
    case "card.deleted":
      return `deleted “${str("title") ?? "a card"}”`;
    case "card.updated":
      return `edited a card (${Array.isArray(d.fields) ? d.fields.join(", ") : "details"})`;
    case "column.created":
      return `added the column “${str("name") ?? ""}”`;
    case "column.renamed":
      return `renamed “${str("from") ?? ""}” to “${str("to") ?? ""}”`;
    case "column.deleted":
      return `deleted the column “${str("name") ?? ""}”`;
    case "column.reordered":
      return "reordered the columns";
    case "organization.created":
      return `created the organisation “${str("name") ?? ""}”`;
    case "team.created":
      return `created the team “${str("name") ?? ""}”`;
    case "invite.created":
      return `created an invite link that joins people as ${str("role") ?? "a member"}`;
    case "invite.revoked":
      return "revoked an invite link";
    case "member.joined":
      return `joined a team as ${str("role") ?? "a member"}`;
    case "member.role_changed":
      return `changed someone from ${str("from") ?? "?"} to ${str("to") ?? "?"}`;
    case "member.removed":
      return "removed someone from the organisation";
    case "account.deleted":
      return "deleted their account";
    default:
      return action;
  }
}
