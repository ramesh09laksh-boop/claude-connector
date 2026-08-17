# Lanes — a team Kanban board

## Context

You want a Trello-style Kanban board that a team collaborates on, with real
multi-tenancy underneath it: multiple organisations, teams within them, roles
that mean something, and invite links to bring people in. Cards move by drag and
drop. Sign-in is email and password.

The working directory (`claude-connector`) is empty, so this is a greenfield
build — nothing to integrate with, no existing code to reuse. It follows the
`start-an-app` skill: Next.js + TypeScript + Tailwind + shadcn/ui, Drizzle ORM
on Postgres, Better Auth for accounts.

The intended outcome is a running app you can sign up for, create an
organisation in, add a team to, invite people to by pasting a link, and then
actually use — dragging cards between columns and seeing your teammates' moves
appear within a few seconds.

**Decisions you made in the interview:**

| | |
| --- | --- |
| Board scope | One board per team. Org → teams → each team has exactly one board |
| Card fields | Title, description, assignee, due date. No labels, comments or attachments |
| Invites | Reusable team link, anyone with the URL joins. Expires in 7 days, revocable |
| Roles | Owner / Admin / Member |
| Database | Postgres in Docker |
| Live updates | Poll every ~3 seconds |
| Front door | A real landing page (so the app is meant to be found) |
| Agent access | No — people use it in a browser |
| Email | Resend, for password reset and email confirmation only |
| Name | **Lanes** — "Every team's work, in its lane." |

---

## Build sheet

This is the bar the finished app gets checked against. If a line here is wrong,
say so now — it is much cheaper than after the schema exists.

**Lanes** — one Kanban board per team, for organisations that want their work
visible in one place.

**What it remembers:** organisations; teams inside them; people, and what role
each person has in each organisation; one board per team; the columns on that
board; and cards — title, description, who it's assigned to, when it's due, and
which column it sits in.

**What you can do:** sign up, create an organisation, create teams inside it,
generate a reusable invite link for a team and paste it wherever, join via
someone else's link, add and edit and delete cards, drag a card to another
column or to a different position, assign a card to a teammate, set a due date,
add/rename/delete/reorder columns, change someone's role, and remove someone.

**Signing in:** email and password. "Forgot password" emails a reset link.

**Roles:**
- **Owner** — everything, including deleting the organisation and transferring ownership
- **Admin** — invite and remove people, create teams, manage columns, plus everything a Member can do
- **Member** — create, edit, delete and drag cards; assign; set due dates

**Live updates:** the board quietly re-checks every ~3 seconds, so a teammate's
move appears on your screen within a few seconds. Two people moving the same
card at once: last write wins and both boards agree within one poll.

**Also included:** a settings area (profile, email and verification status,
password, signed-in devices, delete my account, download my data), and a system
page showing what's configured, what's happened, and every email the app sent.

**Legal:** it's a public product strangers can sign up for, so it gets a privacy
policy and terms, written from what the app actually does. No cookie banner —
the only cookie is the sign-in session, which is the thing you asked for, and
nothing here tracks anyone. Add analytics later and it will need one.

**Being found:** public, so it gets a sitemap, a `robots.txt`, an `llms.txt` and
a preview card for when the link gets shared. The invite pages are deliberately
kept out of search.

**Not in version one:** labels, comments, attachments, checklists, card
activity history, multiple boards per team, archiving, search, @mentions,
notification emails, help/documentation pages, Google sign-in, mobile app,
public/shareable read-only boards.

**Needs something from you:** Docker Desktop running (it's installed but not
currently started) before `npm run db:up` works. Nothing else — the app runs
end to end with no API keys, and password-reset emails print to the terminal
until you add a Resend key and a domain.

---

## Stack

Fixed by the skill, so this is a statement rather than a proposal: Next.js (App
Router, TypeScript, Tailwind, shadcn/ui), Drizzle ORM, Better Auth, Postgres in
Docker, Resend for email.

Two additions specific to this app:

- **`@dnd-kit`** for drag and drop — core + sortable + modifiers. It's the
  current default for React Kanban boards, and critically it ships keyboard
  dragging out of the box (space to lift, arrows to move, space to drop), which
  the alternatives make you hand-roll. `react-beautiful-dnd` is deprecated and
  is not on the table. Atlassian's Pragmatic drag-and-drop is faster at
  thousands of cards and worse at everything else here.
- **Better Auth's `organization` plugin, with `teams: { enabled: true }`** —
  this is the single most important structural choice in the plan. It provides
  organisations, members, roles, teams, team members, an active-organisation and
  active-team on the session, and an access-control system for custom
  permissions. The skill's hard rule is that Better Auth owns anything belonging
  to a user, and hand-rolling multi-tenancy beside it is how you end up with two
  disagreeing ideas of who a person is.

**Package manager: npm.** `pnpm` is not installed. The skill's reference files
are written with `pnpm`; every command gets translated (`npx create-next-app`,
`npx shadcn@latest add`, `npm run db:migrate`), including inside `package.json`
scripts.

---

## Data model

Two groups of tables, and the boundary between them matters.

### Generated by Better Auth — never hand-edited

Written by `npx @better-auth/cli generate` into `src/lib/db/auth-schema.ts` and
left exactly as produced: `user`, `session`, `account`, `verification`,
`organization`, `member`, `invitation`, `team`, `teamMember`.

**The trap:** every id in these tables is `text`, not `uuid`. So any column of
ours pointing at a user or a team is `text` even though our own tables use
`uuid` primary keys. Declaring it `uuid` looks tidier and fails at migrate time
with a foreign-key type mismatch.

The `invitation` table exists because the plugin creates it. We do not use it —
see *Invite links* below.

### Ours — `src/lib/db/schema.ts`

Every one gets `id: uuid("id").primaryKey().defaultRandom()`.

- **`board`** — `teamId` (`text`, unique, → `team.id`, cascade), `name`,
  `createdAt`. One row per team, enforced by the unique constraint. Created
  automatically when a team is created.
- **`board_column`** — `boardId` (`uuid`, cascade), `name`, `position`
  (`integer`), `createdAt`. Named `board_column` because `column` collides with
  SQL. A new board is seeded with **To Do / Doing / Done**.
- **`card`** — `columnId` (`uuid`, cascade), `title`, `description` (`text`,
  nullable), `assigneeId` (`text` → `user.id`, `onDelete: "set null"`),
  `dueDate` (`timestamp`, nullable), `position` (`integer`), `createdById`
  (`text` → `user.id`, `set null`), `createdAt`, `updatedAt`.
- **`team_invite_link`** — `token` (`text`, unique, from
  `crypto.randomBytes(24).toString("base64url")`), `organizationId` (`text`),
  `teamId` (`text`), `role` (`text`), `createdById` (`text`), `expiresAt`,
  `revokedAt` (nullable), `useCount` (`integer`, default 0), `createdAt`.
- **`email_log`** — exactly as `references/email.md` specifies.
- **`activity_log`** — exactly as `references/ops.md` specifies.

**No `notification_preference` table and no Notifications settings tab.** Email
is wired, but every message this app sends is transactional — password reset,
email confirmation, delete-account confirmation — and transactional email
ignores preferences by design. A tab listing categories nobody can turn off is
the exact failure `references/settings.md` warns about.

### Ordering

`position` is a plain integer, dense per column, and **every move rewrites the
positions of the affected column(s) inside one transaction**. Not fractional
floats (they run out of precision after ~50 midpoint inserts in one gap) and not
a ranking library (an extra dependency for a problem this app doesn't have at
this size). With tens of cards per column, renumbering is a single fast
statement and it's completely deterministic, which is what makes concurrent
moves converge.

---

## Permissions

**Two unrelated things are both called "admin". Keep them apart.**

1. **Organisation role** — `owner` / `admin` / `member`, from the Better Auth
   organization plugin. This gates everything a user does in the app.
2. **Platform admin** — the `user.role` field (`user` / `admin`) that
   `references/settings.md` adds, where the first account created becomes
   `admin`. This gates exactly one thing: `/settings/system`. It has nothing to
   do with organisations.

Org permissions are defined with the plugin's access control in
`src/lib/permissions.ts`: `createAccessControl` with the plugin's default
statements (`organization`, `member`, `invitation`, `team`) extended with
`card` and `column` resources, then `owner` / `admin` / `member` roles built
from them and passed to the plugin as `ac` and `roles`.

**One guard module, `src/lib/board-guards.ts`, and every read and write goes
through it.** This is the part that decides whether the app leaks:

- `requireUser()` — session or throw.
- `requireOrgMember(organizationId)` — the session user has a `member` row for
  that org; returns their role.
- `requireTeamAccess(teamId)` — resolves the team's org, checks membership,
  checks the `teamMember` row.
- `requireCardAccess(cardId, permission)` — resolves `card → board_column →
  board → team → organization` **on the server, from the card id alone**, then
  checks membership and the permission.

**The organisation, team and user ids always come from the session or from
walking that chain — never from a form field, query parameter or request body.**
A `teamId` posted by the client is an id someone can change in devtools.

---

## Key implementation notes

### Drag and drop

The board page (`src/app/(dashboard)/teams/[teamId]/page.tsx`) is a server
component that calls `getBoardState(teamId, userId)` from `src/lib/boards.ts`
and hands the result to a `<Board initial={...}>` client component. The client
component owns board state, because optimistic dragging needs it to.

On drop: update local state immediately, call the `moveCard` server action, and
reconcile from what comes back. On failure, revert and toast.

`moveCard({ cardId, toColumnId, toIndex })` — `requireCardAccess(cardId,
"card:update")`, assert `toColumnId` belongs to the same board, then in one
transaction renumber the source and destination columns.

Use `@dnd-kit`'s `PointerSensor` with an activation distance (so a click to open
a card isn't read as a drag) alongside `KeyboardSensor`, and a `DragOverlay` for
the card that follows the cursor.

### Live updates

`GET /api/boards/[boardId]/state` — `runtime = "nodejs"`, session-checked via
`requireTeamAccess`, returns **the same `getBoardState` shape the server
component used**. One function, one data shape, two callers.

The client polls it every 3s and swaps in the result, with three rules: skip
while a drag is in flight, skip while the tab is hidden
(`document.visibilityState`), and skip while a card dialog is open with unsaved
edits. Without those, a poll yanks the board out from under someone mid-action.

### Invite links

The plugin's `invitation` table is email-bound by design — you name a person and
only that address can accept. You chose a reusable link anyone can use, so this
app owns the link itself in `team_invite_link` and hands membership back to
Better Auth to create:

1. An Owner/Admin creates a link from the team page — role and expiry chosen,
   token generated server-side.
2. `/invite/[token]` is public. It resolves the token, checks it isn't revoked
   or expired, and shows which organisation and team it's for.
3. Signed out → sign in or sign up, then back to the same link.
4. Signed in → **`auth.api.addMember()`** adds them to the organisation with the
   link's role, then to the team. Membership is still Better Auth's, which is
   the rule that matters.
5. Already a member → say so and send them to the board rather than erroring.
6. `useCount` increments; Admins see the count and a Revoke button.

The invite page carries `robots: { index: false }` in its metadata.

### First run

A brand-new account has no organisation, so `/dashboard` sends them to "create
your organisation", which creates the org, a first team, that team's board, and
its three default columns in one transaction, then lands on the board. An
organisation with no teams, and a board with no cards, each get a real empty
state rather than a blank panel.

### Styling

Cool slate neutrals with a single saturated accent as `--primary`, `--radius:
0.5rem`, set once in `src/app/globals.css`. It's a work tool: calm, legible,
dense enough to show a board without scrolling. Checked in light and dark and at
one narrow viewport.

---

## Build order

Each step's reference file is under
`C:\Users\tzhlara2\.claude\skills\start-an-app\references\`. Complete each one's
**Verify** section before moving on.

**Step 0 — currency check.** Before installing anything, dispatch parallel
subagents (one per branch: base project, database, auth + organization plugin,
email, pages, `@dnd-kit`, discoverability) to establish current stable versions,
renamed or deprecated APIs, and changed signatures. The reference files
deliberately pin no versions. *Approving this plan authorises those subagent
dispatches.*

1. **Base project** — `stack.md`. `npx create-next-app@latest .` into the
   current directory, **not a subfolder**. shadcn init.
2. **Database** — `database.md`, Postgres branch. `docker-compose.yml`,
   `db:up`/`db:down`/`db:generate`/`db:migrate` scripts, `build` becomes
   `npm run db:migrate && next build`. **Never `drizzle-kit push`** — not once,
   not for the first table.
3. **Sign-in** — `auth.md`, email + password, plus the `organization` plugin
   with teams enabled and the access control from `src/lib/permissions.ts`.
   Better Auth CLI generate → `db:generate` → read the SQL → `db:migrate`.
4. **Email** — `email.md`. `src/lib/email.ts` (logs first, sends second, and is
   the only file that touches Resend), `email_log`, reset-password and
   verify-email templates written in Lanes' voice. `RESEND_API_KEY` stays empty;
   emails print to the terminal.
5. **App schema and board** — the tables above, then the board itself: server
   actions for cards and columns, the `@dnd-kit` board, the card dialog, the
   team and org switchers, the members page, invite links, `/invite/[token]`.
   This is the bulk of the work and the part that makes it Lanes.
6. **Landing page and dashboard** — `pages.md`. Real landing copy about this
   product, no invented testimonials or logos or user counts. Dashboard route
   group with the server-side session check in
   `src/app/(dashboard)/layout.tsx`.
7. **Legal** — `legal.md`. `/privacy` and `/terms` under `src/app/(legal)/`,
   built from the branches that actually ran: Postgres, email + password hash +
   session cookie, Resend as the mail sub-processor. Unset fields in
   `src/lib/legal.ts` render as a loud yellow marker, never a plausible
   placeholder. No cookie banner.
8. **Settings** — `settings.md`. `freshAge: 0`, the `role` additional field with
   `input: false`, `changeEmail`, `deleteUser`, database-backed rate limits,
   first-account-becomes-admin hook. Profile / Account / Security / System.
   No Notifications, no Billing, no Connected apps, no Cookie preferences.
   `deleteUser.beforeDelete` has to handle a user who is the sole Owner of an
   organisation — either block with a clear message or transfer ownership.
9. **System visibility** — `ops.md`. `/settings/system`, admin-guarded on the
   server. Health card (variable *names* only, never values), activity log,
   email log. Activity verbs are Lanes' own: `card.created`, `card.moved`,
   `column.renamed`, `invite.created`, `member.joined`, `member.role_changed`.
10. **Discoverability** — `seo.md`, last, because it's the only step that sees
    every public page. `src/lib/site.ts` as the one list, then `sitemap.ts`,
    `robots.ts`, `llms.txt`, `opengraph-image.tsx`, and the real `<title>`.
    Nothing behind sign-in goes in the sitemap.

---

## Verification

Per `references/verify.md`, run in this order and **read the output of each** —
having written the code a command tests is why it exists, not a reason to skip
it.

1. `npx tsc --noEmit`, and confirm no `ignoreBuildErrors` / `ignoreDuringBuilds`
   in `next.config.*`.
2. `npm run db:generate` then `git status --porcelain drizzle` — nothing new is
   the pass. Confirm no `push` anywhere in `package.json`.
3. `npm run build`. Read the route table: **any page rendering one team's data
   must be `ƒ`, not `○`** — a `○` there means someone's board was prerendered at
   build time and served to everyone.
4. Lint, using whatever script actually exists.
5. `npm start`, then sweep every route for a status code: `/`, `/sign-in`,
   `/sign-up`, `/privacy`, `/terms`, `/dashboard`, `/teams/[id]`, `/settings`,
   `/settings/account`, `/settings/security`, `/settings/system`. No 500s; `307`
   to sign-in for anything in the dashboard group.
6. `/robots.txt`, `/sitemap.xml`, `/llms.txt` all `200`, and **no sitemap entry
   contains `/dashboard`, `/settings`, `/invite` or `/api`**.
7. `curl -s localhost:3000/ | grep -o '<title>[^<]*'` — must say Lanes, not
   "Create Next App".
8. **You sign up first**, before any probe account exists — the first account
   becomes the platform admin, and a fixture taking that slot then being deleted
   locks you out of your own system page.
9. Two probe accounts over Better Auth's REST surface: signed-out `/dashboard`
   is `307`, with A's cookie it's `200`, and `/settings/system` refuses account
   B on the server rather than merely hiding the link.
10. **Cross-tenant isolation, the check this app most needs.** Seed an org, a
    team, a board and a card owned by A directly at the database layer, then as
    B request `/teams/<A's teamId>` and the card's API route: `404`, never
    `200`. Repeat for `moveCard` with A's card id.
11. Blank every key via a temporary `.env.production.local` (never edit `.env`),
    re-run the route sweep, then delete the file and assert it's gone.
12. Remove the probe accounts and seeded rows; your account is still the admin.

**Then fresh eyes** — four read-only critic subagents dispatched in one message
(promise-keeping, ownership, looks-like-theirs, operability), checking the app
against the build sheet above and nothing else. Two rounds maximum, then report
what's left. *Approving this plan authorises those dispatches too.*

**Named as not runnable from here**, so you can close them in a minute once the
app is open: dragging a card in a real browser (including keyboard dragging),
two browser windows seeing each other's moves within 3s, signing up through the
UI, "forgot password" actually resetting a password, opening an invite link as a
second person, dark mode, and phone-width layout.
