# F12 — System visibility

**Depends on:** F11 · **Blocks:** nothing

## Purpose

An inside view of the app: what's configured, what happened, and what email went
out. This is the answer to "why didn't that invite email arrive?" and "who moved
that card?", inside the app rather than on a hosting dashboard.

**This feature is not optional and is not a polish pass.** An app whose owner can
only debug it by reading host logs is an app that stops being fun the first time
something breaks.

## Technical detail

> **Hard rule: never render a secret, or part of one.** This page reports whether
> something is *configured*, never what it is configured with. No keys, no
> connection strings, no `re_…abc4` tails, not in a tooltip and not in a copy
> button. A masked key is a key with fewer characters to guess, and this page
> exists to be looked at.

### Access

`/settings/system`, linked in the settings nav **only for platform admins**, and
every page and action behind it calls `requireAdmin()` on the server. Hiding the
link is presentation; the guard is the boundary.

Remember the two meanings of "admin": this is the `user.role` flag from F11, not
an organisation Owner/Admin. An organisation Owner who was not the first account
on the instance sees nothing here, and that is correct.

### Health card — `src/lib/system-status.ts`

`import "server-only"`. Presence of the environment variable only:

| Check | Reads | Hint shown |
| --- | --- | --- |
| Database | `select 1` through `db` | — |
| Email (Resend) | `RESEND_API_KEY` | `RESEND_API_KEY` |
| Email delivery status | `RESEND_WEBHOOK_SECRET` | `RESEND_WEBHOOK_SECRET` |
| Canonical URL | `APP_URL ?? BETTER_AUTH_URL` | `APP_URL — the app's public address` |

Only these four. **A row for something Lanes doesn't have — payments, uploads,
jobs, AI, MCP — is a defect in the other direction.**

Each renders green/grey with the plain-language hint: the *name* of the variable
to set, never its value. **"Not configured yet" is a normal state here, not an
error** — it is exactly what a half-built app looks like, and showing it as a
warning trains the user to ignore warnings.

The Canonical URL row gates no feature, which is why it earns its place: without
it the sitemap and every canonical link quietly point at `localhost` in
production, and nobody notices until a search engine has already read them.

### Activity log

```ts
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**`set null`, not cascade** — the log outlives the account so "who deleted that?"
is still answerable afterwards, with only an anonymous row left behind.

`src/lib/activity.ts` exports `logActivity(action, detail?, userId?)`, called
from the server actions that already exist.

Lanes' verbs, in Lanes' words — never `POST /api/x`:

```
organization.created   team.created        board.created
column.created         column.renamed      column.deleted    column.reordered
card.created           card.updated        card.moved        card.deleted
invite.created         invite.revoked      member.joined
member.role_changed    member.removed      account.deleted
```

Log writes, not reads. **Never put a token, password or full payload in
`detail`** — ids and changed field names are enough. The invite token in
particular must never appear here (F05).

Render newest-first with the person's name where there is one, a date filter,
and a limit of the last few hundred rows in the page query. This table grows.

### Email log

Reads `email_log` newest-first: recipient, subject, template, status, when.
Status comes from the send and then from the Resend webhook, so `sent` becoming
`delivered` or `bounced` is visible.

This is the panel that answers the most common support question a small app
gets — "I never got the email" — with an actual answer: never sent because the
key is missing, bounced, or delivered and sitting in spam.

A **Resend** action on failed rows, going through the same `sendEmail` helper so
the retry is logged too. Show the recipient (an admin needs it to help); never
show the message body.

## Gotchas

- No panels for background jobs or agent activity — Lanes has neither.
- `requireAdmin()` throwing in a server component renders a stack trace rather
  than a refusal. Catch it and render a clean "not available" so a non-admin
  hitting the URL sees a page, not a crash.
- The health card must not construct a Resend client to test the key. Presence
  only; anything else turns a status page into a side effect.

## Acceptance criteria

- [ ] `/settings/system` is linked in the settings nav for an admin account and
      **not linked** for a normal one.
- [ ] Visiting `/settings/system` directly as a non-admin is refused **by the
      server**, not merely hidden — and returns a clean page, not a `500`.
- [ ] The health card lists exactly the four checks above and no others.
- [ ] The health card correctly reflects which are configured.
- [ ] **No key, token or connection string appears anywhere in the rendered
      HTML** — checked with `curl`, not by looking at the screen.
- [ ] Moving a card writes an activity row that reads in plain language, with
      the mover's name.
- [ ] Every verb in the list above appears after performing the corresponding
      action.
- [ ] No invite token appears in any `activity_log` row.
- [ ] An email sent by the app appears in the email log with the right status.
- [ ] A failed send can be retried from the page, and the retry is itself
      logged.
- [ ] The email log never shows a message body.
- [ ] With `.env` emptied, the page renders, shows everything as not configured,
      and nothing crashes.
