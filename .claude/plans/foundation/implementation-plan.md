# Lanes — Implementation Plan

Master plan and index. The approved scope lives in
[`lanes-team-kanban-board.md`](./lanes-team-kanban-board.md); that document is
the **build sheet** and this one does not widen it. Each feature below has its
own file under [`features/`](./features/) containing technical detail and
acceptance criteria.

---

## 1. What is being built

**Lanes** — a team Kanban board. One board per team, teams inside
organisations, three roles, reusable invite links, email + password sign-in,
drag-and-drop cards, and a board that refreshes itself every few seconds so
teammates see each other's moves.

Greenfield. The working directory is empty. Nothing to integrate with.

**Stack:** Next.js (App Router, TypeScript, Tailwind, shadcn/ui) · Drizzle ORM ·
Postgres in Docker · Better Auth (+ `organization` plugin with teams) ·
`@dnd-kit` · Resend.

---

## 2. Feature index

| # | Feature | File | Depends on |
| --- | --- | --- | --- |
| F01 | Project scaffold & toolchain | [F01-project-scaffold.md](./features/F01-project-scaffold.md) | — |
| F02 | Database & migrations | [F02-database-and-migrations.md](./features/F02-database-and-migrations.md) | F01 |
| F03 | Authentication | [F03-authentication.md](./features/F03-authentication.md) | F02 |
| F04 | Organisations, teams & roles | [F04-organisations-teams-roles.md](./features/F04-organisations-teams-roles.md) | F03 |
| F05 | Invite links | [F05-invite-links.md](./features/F05-invite-links.md) | F04 |
| F06 | Board domain & server actions | [F06-board-domain-and-actions.md](./features/F06-board-domain-and-actions.md) | F04 |
| F07 | Board UI & drag and drop | [F07-board-ui-drag-and-drop.md](./features/F07-board-ui-drag-and-drop.md) | F06 |
| F08 | Live updates (polling) | [F08-live-updates.md](./features/F08-live-updates.md) | F06, F07 |
| F09 | Transactional email | [F09-transactional-email.md](./features/F09-transactional-email.md) | F03 |
| F10 | Landing page & app shell | [F10-landing-and-app-shell.md](./features/F10-landing-and-app-shell.md) | F04, F07 |
| F11 | Account settings | [F11-account-settings.md](./features/F11-account-settings.md) | F09, F10 |
| F12 | System visibility | [F12-system-visibility.md](./features/F12-system-visibility.md) | F11 |
| F13 | Legal pages | [F13-legal-pages.md](./features/F13-legal-pages.md) | F10 |
| F14 | Discoverability | [F14-discoverability.md](./features/F14-discoverability.md) | F13 |
| F15 | Verification & hardening | [F15-verification-and-hardening.md](./features/F15-verification-and-hardening.md) | all |

---

## 3. Build order

Sequential — the order matters, and the reasons are load-bearing rather than
stylistic.

### Phase 0 — Currency check

Before installing anything, dispatch parallel research subagents (one per
branch: base project, Drizzle, Better Auth + `organization` plugin, Resend +
React Email, `@dnd-kit`, Next metadata conventions) to establish current stable
versions, deprecations, renamed exports and changed signatures.

No file in this plan names a version, deliberately. **On API detail — names,
signatures, import paths, options — the research wins. On how the pieces fit
together, this plan wins.** Anything the research contradicts gets recorded and
reported at hand-off.

### Phase 1 — Foundation (F01 → F02 → F03)

Scaffold, database, accounts. Nothing is visible yet beyond sign-in, and that is
fine. Do not start F04 until sign-up and sign-out demonstrably work.

### Phase 2 — Tenancy (F04 → F05)

Organisations, teams, roles, invite links. This is the structural spine — every
later query is scoped by what F04 establishes. Get the guard module right here
and the rest of the app inherits it.

### Phase 3 — The product (F06 → F07 → F08)

The board itself. This is the bulk of the work and the part that makes the app
Lanes rather than a scaffold.

### Phase 4 — Supporting surfaces (F09 → F10)

Email, then the landing page and app shell. Email comes first because F11's
account settings need a sender to exist.

### Phase 5 — Operability and obligations (F11 → F12 → F13 → F14)

Settings, then the system page, then legal, then discoverability. **This order
is not interchangeable:** F13 adds public pages that F14's sitemap must contain,
and F14 runs last because it is the only step that sees every public page.

### Phase 6 — Proof (F15)

The gate, cross-tenant isolation probes, then four read-only critic subagents
checking the app against the build sheet.

---

## 4. Conventions that apply to every feature

These are stated once here and assumed by every feature file.

### Package manager

**npm.** `pnpm` is not installed on this machine. Reference material written
with `pnpm` gets translated: `npx create-next-app`, `npx shadcn@latest add`,
`npm run db:migrate`, and `"build": "npm run db:migrate && next build"` inside
`package.json`.

### Ids and types

- Every table **we** define gets `id: uuid("id").primaryKey().defaultRandom()`.
- Better Auth's generated tables are left byte-for-byte as the CLI produced
  them, including their `text` ids.
- **Any column referencing a Better Auth table is `text`, never `uuid`** — this
  includes `userId`, `teamId`, `organizationId`. Declaring it `uuid` looks
  consistent and fails at migrate time with a foreign-key type mismatch.
- Columns referencing *our* tables use `uuid`.

### Schema changes

Every time, without exception:

```bash
npm run db:generate    # writes reviewable SQL into ./drizzle
# read the generated SQL — a DROP COLUMN you didn't intend is visible here
npm run db:migrate
```

**Never `drizzle-kit push`.** Not for the first table, not for a "quick" column.
`db:push` is deliberately absent from `package.json` so it isn't within reach.
`drizzle/` is committed — it is source code.

Anything that changes `src/lib/auth.ts` config requires re-running the Better
Auth CLI generate before `db:generate`.

### Authorisation

**Every read and write goes through `src/lib/board-guards.ts`.** No page, server
action or route handler queries a tenant-scoped table without first resolving
access through a guard.

**The session is the only acceptable source of the current user.** A user id,
organisation id or team id taken from a form field, query parameter, request
body or header is a defect even where the code looks correct today. Tenant ids
are resolved by walking the ownership chain server-side from the one id the URL
legitimately carries.

Middleware may redirect optimistically; it is never the security boundary. The
session check that matters runs where the data is read.

### Activity logging

Every write path calls `logActivity()` from `src/lib/activity.ts` with the app's
own verbs — `card.moved`, `invite.created`, `member.joined` — never a route or
table name. Log writes, not reads. Never put a password, token or full payload
in `detail`.

### Degradation

Every integration is switched on the **presence of its environment variable**,
not on `NODE_ENV` or a mode flag. No module throws at import time when a key is
absent: no `process.env.X!` non-null assertions at module scope, no client
constructed unconditionally. The affected surface says which variable to set.

No secret ever reaches the browser. Anything behind `NEXT_PUBLIC_` is public by
definition.

### Naming

The app's nouns are **organisation, team, board, column, card, member** — on
screen, in the schema, in activity verbs, in the legal pages and in the emails.
Never "Item", "Entry", "Record", or "Project". A framework default anywhere a
person can read it is a defect, including `<title>`.

---

## 5. Definition of done

A feature is done when every acceptance criterion in its file is met **and
demonstrated**, not asserted. Having written the code that a check tests is why
the check exists, not a reason to skip it.

Across the whole build:

- `npx tsc --noEmit` clean, with no `ignoreBuildErrors` or `ignoreDuringBuilds`
  in `next.config.*`.
- `npm run build` succeeds, and every route rendering one team's data shows as
  `ƒ` (dynamic) in the route table — a `○` there means a board was prerendered
  at build time and is served to everyone.
- `npm run db:generate` produces no new migration (schema and history agree).
- Lint passes on errors.
- Cross-tenant isolation proven by probe, not by reading the code.
- Every check that could not be run is **named** at hand-off with what it would
  need. A skipped check that goes unnamed is a false pass.

**The gate is passed by fixing the code, never by widening the gate.** No
suppression comment, ignore flag, or deleted promise is an acceptable fix.

---

## 6. Out of scope

From the build sheet, and enforced in both directions during F15 — building one
of these is as much a defect as omitting a promised feature:

labels · comments · attachments · checklists · card activity history · multiple
boards per team · archiving · search · @mentions · notification emails ·
help/documentation pages · Google sign-in · mobile app · public read-only boards

---

## 7. Prerequisites from the user

| What | When | Why |
| --- | --- | --- |
| Docker Desktop running | Before F02 | Installed but not currently started; `npm run db:up` fails without it |
| Sign up for the first account | Before F15 step 8 | The first account becomes the platform admin; a probe fixture taking that slot then being deleted locks the user out of `/settings/system` |
| Resend API key + a domain | Optional, after hand-off | Only needed to email a real person; until then password-reset links print to the terminal |
| `APP_URL` on the host | At deploy | Otherwise the sitemap and canonical links point at `localhost` |
