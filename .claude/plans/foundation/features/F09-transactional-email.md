# F09 — Transactional email

**Depends on:** F03 · **Blocks:** F11, F12

## Purpose

The three messages this app owes people: confirm your email address, reset your
password, confirm deleting your account. Real delivery in production, and a
readable log locally without sending anything to anyone.

**Invites are not email.** They are copy-paste links (F05). Nothing in this
feature sends an invitation.

## Technical detail

### Packages

```bash
npm i resend react-email
npm i -D @react-email/ui
```

Import components, `render` and `toPlainText` from **`react-email`** — not
`@react-email/components`, not the per-component packages. Those still install
and still resolve, which is exactly why the mistake is easy to make and hard to
spot. `@react-email/ui` is the local preview server only.

`.env`:

```
RESEND_API_KEY=
EMAIL_FROM="Lanes <hello@send.example.com>"
```

**`RESEND_API_KEY` stays empty.** An empty key *is* the local development mode.

Script: `"email:dev": "email dev --dir src/emails"`.

### The send helper — `src/lib/email.ts`

`import "server-only"`. **The only file in the project that talks to Resend.**

It switches on the *presence of the key*, not on `NODE_ENV` or a mode flag, so
nothing has to be remembered at deploy time:

```ts
const apiKey = process.env.RESEND_API_KEY;
export const emailConfigured = Boolean(apiKey);
const resend = apiKey ? new Resend(apiKey) : null;
```

**Hard rule: nothing sends until it's logged.** `sendEmail()` inserts an
`email_log` row with status `pending` *first*, then sends. That row is what F12
renders, what answers "why didn't my email arrive?", and what outlives Resend's
30-day retention.

Three details that are wrong by default and fail silently:

- **`resend.emails.send()` does not throw on an API error.** It returns
  `{ data, error }`. A `try`/`catch` catches network failures only and swallows
  every rejected send — wrong domain, unverified sender, over quota. Check
  `error` and write `status: "failed"` with the message.
- **`idempotencyKey` is the second argument**, not a payload field. In the
  payload it is ignored and a retry sends twice. Use `` `${template}/${row.id}` ``.
- **Parameters are camelCase in the Node SDK** (`replyTo`, `scheduledAt`). The
  REST API uses snake_case; the SDK does not, and it fails silently.

With no key: log the message and the link to the terminal, set status `logged`,
return. Signup and password reset then work end to end on day one.

### The log table

`email_log` — `id` (`uuid`), `to`, `subject`, `template`, `status`
(`pending | logged | sent | delivered | bounced | complained | failed`),
`providerId`, `error`, `createdAt`, `updatedAt`.

### Templates — `src/emails/`

`verify-email.tsx`, `reset-password.tsx`, `confirm-delete.tsx`. Short and plain
— an email is not a landing page. Written in Lanes' voice: "Confirm your email
to get your team on the board", not "Verify your account". Signed **Lanes**.

### Wiring Better Auth

Extend `src/lib/auth.ts` — this adds to the config, replaces nothing:

- `emailAndPassword.sendResetPassword`
- `emailVerification.sendOnSignUp: true`, `autoSignInAfterVerification: true`,
  `sendVerificationEmail`

**`void`, not `await`.** This is a security rule, not a style preference:
awaiting the send makes the response measurably slower when the account exists
than when it doesn't, which tells an attacker who has an account. Fire it and
return.

**Leave `requireEmailVerification` off.** Blocking sign-in on verification turns
one mistyped address into a support request the user cannot answer. F11 builds
the nag-banner-and-resend pattern instead.

Adding these hooks does not change the schema, so no Better Auth CLI
regeneration here. The `email_log` table does need `db:generate` + `db:migrate`.

### Delivery status (optional, worth it)

`src/app/api/webhooks/resend/route.ts` — verify the signature against the **raw**
body (`req.text()`; parsing as JSON and re-serialising changes the bytes and
every request fails), then update `email_log.status` by `providerId`. Secret in
`RESEND_WEBHOOK_SECRET`. This is what turns `sent` into `delivered` or `bounced`
on F12's panel.

### Going live (hand-off, not now)

Resend's `onboarding@resend.dev` delivers only to the address the account signed
up with. Emailing anyone else needs a verified domain: add a **subdomain**
(`send.theirdomain.com`, so a deliverability problem never touches their normal
email), three DNS records (MX on `send`, SPF TXT on `send`, DKIM TXT on
`resend._domainkey`), then a `_dmarc` TXT of `v=DMARC1; p=none;`. About ten
minutes, free. Free tier: 100 emails/day, 3,000/month, one domain.

Test with `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`.
**Never `@example.com`** — Resend rejects it with a 422.

## Gotchas

- Anything that sends must run on the Node runtime: `export const runtime =
  "nodejs"` in route handlers.
- Never call `resend.emails.send()` from a page, action or route directly. One
  door, and it logs.
- No `process.env.RESEND_API_KEY!` anywhere — the module must import cleanly
  with the key absent.

## Acceptance criteria

- [ ] `npm run email:dev` opens the preview and all three templates render at
      desktop and mobile widths.
- [ ] With `RESEND_API_KEY` empty: signing up prints the confirmation email to
      the terminal, the printed link works when pasted into the browser, and an
      `email_log` row appears with status `logged`.
- [ ] "Forgot password" sends a reset link that **actually resets the password**
      — the old password then fails and the new one works.
- [ ] Clicking the confirmation link flips `emailVerified` to true.
- [ ] With a real key, sending to `delivered@resend.dev` reaches status `sent`.
- [ ] A deliberately broken send records status `failed` with the error message,
      rather than appearing to succeed.
- [ ] Every email's wording is about Lanes — no "My App", no placeholder
      addresses, and each is signed with the app's own name.
- [ ] `grep -rn "resend.emails.send" src/` matches only `src/lib/email.ts`.
- [ ] With `.env` values absent the app still starts and every email degrades to
      the terminal log instead of crashing.
- [ ] No `NEXT_PUBLIC_` variable holds anything Resend-related.
