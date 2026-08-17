# F05 — Invite links

**Depends on:** F04 · **Blocks:** nothing

## Purpose

A reusable link that an Owner or Admin creates for a team and pastes wherever
they like. Anyone holding it joins that team with the role baked into the link.
Expires after 7 days, revocable early, and the revoke kills it for everyone.

## Why this doesn't use the plugin's `invitation` table

Better Auth's `organization` plugin has an invitation flow, and the rule
elsewhere in this project is to use the plugin rather than hand-rolling. Here it
does not fit: **the plugin's invitation is email-bound by design.** You name a
person, a row is created against their address, and only someone signed in as
that address can accept. That is a different product from the link the user
chose — and it was offered explicitly during the interview and turned down.

So this app owns the *link*, and hands *membership* back to Better Auth:

- Ours: the `team_invite_link` table, the token, expiry, revocation, use count.
- Better Auth's: the actual `member` and `teamMember` rows, created via
  `auth.api.addMember()`.

That keeps one source of truth for who a person is, which is the part of the rule
that matters. The plugin's `invitation` table exists in the schema, unused.

## Technical detail

### Table

`team_invite_link` — `id` (`uuid`, default random), `token` (`text`, unique),
`organizationId` (`text`), `teamId` (`text`), `role` (`text`), `createdById`
(`text` → `user.id`), `expiresAt` (`timestamp`), `revokedAt` (`timestamp`,
nullable), `useCount` (`integer`, default 0), `createdAt`.

Index on `token`. It is the lookup key on every invite page load.

### Token

```ts
crypto.randomBytes(24).toString("base64url")
```

32 URL-safe characters, ~192 bits. **Not the row's UUID** — a UUID as a bearer
credential invites someone to guess a version or timestamp out of it, and the
token is genuinely a secret in a way a row id should not have to be.

### Creating a link — `createInviteLink({ teamId, role, expiresInDays })`

1. `requireOrgPermission(org, { invitation: ["create"] })` after resolving the
   organisation from `teamId` via `requireTeamAccess`.
2. **Reject a role higher than the caller's** — an Admin cannot mint an Owner
   link. This is the privilege-escalation hole in this feature and the check that
   closes it.
3. Insert the row, return the token.
4. `logActivity("invite.created", { teamId, role })`.

### The invite page — `/invite/[token]`

Public, outside the dashboard route group, `export const metadata = { robots: {
index: false } }`.

Resolution order, and each branch gets its own readable screen — never a raw
error:

| State | What the visitor sees |
| --- | --- |
| Token unknown | "This invite link isn't valid." |
| `revokedAt` set | "This invite has been revoked." |
| `expiresAt` past | "This invite has expired. Ask for a new one." |
| Valid, signed out | Organisation and team name, then Sign in / Sign up, returning to this same URL |
| Valid, signed in, not a member | "Join **Engineering** at **Acme Corp** as a Member" + a Join button |
| Valid, signed in, already a member | "You're already in this team" + a link to the board — **not** an error |

### Accepting — `acceptInviteLink(token)`

In one transaction:

1. Re-resolve and re-validate the token **server-side**. The page render is not
   the check; a link can expire between render and click.
2. `auth.api.addMember({ body: { userId, organizationId, role } })` if not
   already an organisation member.
3. Add the `teamMember` row.
4. Increment `useCount`.
5. `logActivity("member.joined", { teamId, via: "invite_link" })`.
6. Redirect to the team's board.

### Managing links

On `/teams/[teamId]/members`, Owner/Admin only: the active link with a copy
button, its role, how many people have used it, when it expires, and a Revoke
button. Revoking sets `revokedAt` and takes effect on the next attempt.

One active link per team-and-role is enough; creating a new one for the same role
revokes the previous.

## Gotchas

- **The link is a bearer credential.** Anyone forwarded the URL can join — that
  is the trade the user accepted knowingly. It follows that: it never appears in
  a log or an activity `detail`, the page is `noindex`, and the token is compared
  in full rather than by prefix.
- Validate on accept, not only on render.
- A signed-out visitor must come back to the *same* invite URL after signing up.
  Pass it through as a `callbackURL`/`redirect` and validate that the target is
  a relative path on this app before redirecting to it, or the invite page
  becomes an open redirect.
- Accepting must be idempotent. A double-click, or a shared link opened twice by
  the same person, adds one membership and does not throw.
- Rate-limit `acceptInviteLink` — it is a public, unauthenticated-until-sign-in
  endpoint that reads a token.

## Acceptance criteria

- [ ] An Admin creates a link; the copy button yields a URL that resolves.
- [ ] A second person opens the link signed out, signs up, and lands on the
      team's board as a Member.
- [ ] A third person opens the **same** link and also joins — it is reusable —
      and `useCount` reads 2.
- [ ] Revoking the link makes the next attempt show "revoked", for everyone.
- [ ] A link with `expiresAt` in the past shows "expired" and creates no
      membership.
- [ ] An unknown token shows a readable message, not a stack trace or a 500.
- [ ] Opening a valid link while already a member shows the "already in this
      team" screen and does not create a duplicate membership row.
- [ ] Clicking Join twice in quick succession creates exactly one membership.
- [ ] **An Admin cannot create an Owner-role link** — the action refuses.
- [ ] A Member cannot create a link at all; the server action refuses when
      called directly, not merely hidden in the UI.
- [ ] A token expiring between page render and clicking Join is rejected on
      accept.
- [ ] `/invite/<token>` serves `robots: index: false` and appears in no sitemap.
- [ ] No token value appears in `activity_log`, `email_log`, or any server log.
- [ ] `member.joined` and `invite.created` rows appear on the system page.
