# F11 — Account settings

**Depends on:** F09, F10 · **Blocks:** F12

## Purpose

The place a signed-in person manages themselves: profile, email and verification
status, password, signed-in devices, downloading their data, and leaving. An app
without this feels unfinished the first time someone asks how to change their
password.

## Technical detail

> **Hard rule: every panel is built on Better Auth's own API.** No route that
> updates the `user` table directly, hashes a password by hand, or deletes a
> user row with Drizzle. Going around it means sessions that don't get revoked,
> tokens that don't get cleaned up, and a hash format that quietly diverges from
> the one sign-in checks against.

### Config changes — `src/lib/auth.ts`

```ts
session: { freshAge: 0 },

user: {
  additionalFields: {
    role: { type: ["user", "admin"], required: false,
            defaultValue: "user", input: false },
  },
  changeEmail: { enabled: true },
  deleteUser: { enabled: true, /* see below */ },
},

rateLimit: {
  enabled: true,
  storage: "database",
  customRules: {
    "/send-verification-email": { window: 60, max: 2 },
    "/change-email":            { window: 60, max: 3 },
    "/change-password":         { window: 60, max: 5 },
    "/delete-user":             { window: 60, max: 3 },
  },
},
```

Both of the first two cause bugs that only appear in production:

- **`freshAge: 0`** — by default Better Auth treats a session older than 24h as
  not fresh and refuses to list sessions. The devices panel would work for a day
  and then return 403 to every returning user while the revoke buttons kept
  working, which reads as a bug in the page rather than a policy. Requiring a
  password on the genuinely dangerous action instead is the clearer trade.
  Comment it so nobody "fixes" it back.
- **`input: false` on `role`** is the security control, not a formality. Without
  it the role is an ordinary profile field and a user can set their own to
  `admin` through the normal update call.

`rateLimit` is disabled in development and defaults to in-memory storage, which
does nothing across serverless instances — `storage: "database"` is what makes
the resend cooldown real.

Schema changes ⇒ Better Auth CLI generate → `db:generate` → read → `db:migrate`.

### First account becomes the platform admin

```ts
databaseHooks: { user: { create: { before: async (user) => {
  const [row] = await db.select({ n: count() }).from(userTable);
  return { data: { ...user, role: row.n === 0 ? "admin" : "user" } };
}}}}
```

**This `role` is the platform admin flag and has nothing to do with organisation
roles.** It gates exactly one thing: `/settings/system`. Two accounts created in
the same instant could both come out admin; for a new app with one owner that is
not worth solving.

`src/lib/auth-guards.ts` — `requireUser()` and `requireAdmin()`, used by every
admin-only page *and every action behind it*.

### Sections

`src/app/(dashboard)/settings/layout.tsx`, inside the existing dashboard group
so it inherits F10's sign-in check. One route per section, one shadcn `Card` per
concern, **each card with its own save button** — never one giant form with a
single Save.

| Section | Route | Contents |
| --- | --- | --- |
| Profile | `/settings` | Name and avatar via `authClient.updateUser` |
| Account | `/settings/account` | Email + verification badge, change email, danger zone |
| Security | `/settings/security` | Change password, active sessions and devices |
| System | `/settings/system` | F12 — **platform admins only** |

**Build only the sections this app has.** No Billing (no payments), no Connected
apps (no agent access), no Cookie preferences (no banner), and **no
Notifications** — every email Lanes sends is transactional, and transactional
email ignores preferences by design. A tab listing categories nobody can turn
off is worse than a missing tab.

### Account

- **Verification badge** with a resend control that appears only when needed and
  disappears entirely once verified — the endpoint returns 400 for an
  already-verified user, and surfacing that where a success message belongs is
  confusing. 60-second cooldown, honouring `X-Retry-After` from a rate-limit
  rejection.
- **Change email** — `authClient.changeEmail({ newEmail, callbackURL })`. Word
  the confirmation as **"check your new inbox"**, never "email changed": Better
  Auth deliberately returns success even when the address belongs to somebody
  else, so the page can't be used to discover who has an account.

### Security

- **Change password** — `changePassword({ currentPassword, newPassword,
  revokeOtherSessions: true })`, with that box checked by default.
- **Active sessions** — `listSessions()` rendered one row each: a human device
  line ("Chrome on Windows", parsed, not the raw user-agent string), IP, last
  active, Revoke. The current session is marked **This device** and offers no
  revoke. Plus "Sign out everywhere else".

### Danger zone — bottom of `/settings/account`

A visually distinct card with real whitespace above it. Deletion is immediate
and permanent.

The dialog, in order:

1. Say exactly what disappears, **counted from their real data**: "This deletes
   your account. You'll be removed from 2 organisations and 3 teams. Cards you
   created stay on their boards, unassigned."
2. Offer **Download my data** first — a small server action returning their own
   rows as JSON: profile, their memberships, and the cards they created or are
   assigned. Never password hashes, never another user's rows.
3. Require them to **type their email address** to enable the button. Harder to
   do by reflex than typing "DELETE", and it restates whose account this is.
4. Require their password.
5. `deleteUser({ password, callbackURL: "/goodbye" })` → confirmation email →
   the link deletes the account, clears every session, and lands on `/goodbye`.

**`beforeDelete` must handle the sole-Owner case.** A user who is the only Owner
of an organisation cannot simply vanish — either block deletion with a message
naming the organisations and telling them to transfer ownership first, or
transfer it. Silently orphaning an organisation is the failure mode here, and it
is the one thing in this feature the reference material does not cover because
it is specific to Lanes having tenants.

### Unverified-email banner

In the dashboard layout, above the content, whenever `emailVerified` is false.
**Do not lock the app.** Gate only what would embarrass someone from an
unconfirmed address — here, that is **creating invite links**. Everything else
stays usable.

## Acceptance criteria

- [ ] `/settings` is reachable from the app's navigation, not just by URL.
- [ ] Changing a name saves and the header updates without a hard refresh.
- [ ] A brand-new account shows the unverified banner; confirming clears it and
      flips the badge.
- [ ] The resend button disables for 60s and disappears once verified.
- [ ] An unverified user cannot create an invite link, but can use the board.
- [ ] Changing a password works, and with "sign out other devices" checked a
      second browser's session is actually ended.
- [ ] The devices list marks the current session, revoking another signs it out
      in a second browser, **and the list still loads for an account signed in
      more than 24 hours ago** (this is what `freshAge: 0` buys).
- [ ] A user cannot set their own `role` to `admin` through
      `authClient.updateUser` — proven by trying it.
- [ ] Download my data returns the signed-in user's rows only, with no hashes
      and no other user's data.
- [ ] Deleting a test account sends the confirmation email, the link removes the
      account, and signing in with it afterwards fails.
- [ ] **Deleting the sole Owner of an organisation is either blocked with a
      clear message or transfers ownership** — it never leaves an ownerless
      organisation.
- [ ] Cards created by a deleted user remain on their boards, unassigned.
- [ ] A second account sees none of the first's data anywhere in settings, and
      has no System link.
- [ ] Every section that exists corresponds to something Lanes actually has —
      no Billing, no Notifications, no Connected apps, no Cookie preferences.
- [ ] With `.env` emptied the settings pages still render, showing a friendly
      "not configured yet" rather than crashing.
