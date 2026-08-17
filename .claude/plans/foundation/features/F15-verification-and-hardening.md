# F15 — Verification & hardening

**Depends on:** everything · **Blocks:** hand-off

## Purpose

Everything before this is construction. This is the only feature that asks
whether any of it is true.

Each earlier feature's acceptance criteria were confirmed by the same agent that
wrote the code they check, and recall is not evidence — an app can satisfy every
one of them while failing to compile.

> **Hard rule: the gate is passed by fixing the code, never by widening the
> gate.** No `ignoreBuildErrors`, no `ignoreDuringBuilds`, no `@ts-expect-error`
> or `eslint-disable` added to quiet a check, and no deleting something the build
> sheet promised so a check stops asking about it. A gate that can be moved is a
> gate that will be, at the exact moment it was about to be useful.

## Before running anything

- **Note the current commit** — `git rev-parse HEAD`. Fix rounds are diffed
  against it.
- **Check port 3000.** If something is listening it is almost certainly the
  user's own dev server. **Do not kill it.** Ask them to stop it, or run the
  read-only probes against it and name the production-mode checks as
  unperformed.
- **Check Docker is up** — `npm run db:up` then `docker compose ps`. If the
  daemon isn't running, stop and say so plainly: every command below fails
  identically whether the app is broken or Docker is off, and a fix loop that
  can't tell those apart will rewrite working code.

## The gate

Cheap and diagnostic before expensive and opaque. **Read the output of every
one.**

### 1 — Types

```bash
npx tsc --noEmit
grep -n "ignoreBuildErrors\|ignoreDuringBuilds" next.config.* || echo "clean"
```

A match on the second is itself the finding: remove it and re-run.

*Known false failure:* Next's generated route-type helpers don't exist until a
build has written `.next/types`. If the only errors name them, run step 3 once
and come back. Never "fix" this by loosening `tsconfig.json`.

### 2 — Schema and migrations — **before the build**

`npm run build` is `npm run db:migrate && next build`. Reaching it with an
ungenerated schema edit outstanding means the gate itself applies SQL nobody
read.

```bash
npm run db:generate
git status --porcelain drizzle
```

Nothing new is the pass. A new `.sql` file means the schema was edited and never
generated — **read it**. A `DROP COLUMN`, or a drop-plus-add where a rename was
meant, stops the gate and goes to the user.

```bash
npm run db:migrate
grep -n '"db:push"\|drizzle-kit push' package.json || echo "clean"
```

`drizzle/` is committed, not untracked.

### 3 — Build, and its route table

```bash
npm run build
```

Then read the route table — free evidence nothing else provides. **Every route
rendering one team's data must be `ƒ` (Dynamic), not `○` (Static).** A `○` on
`/teams/[teamId]` means a board was prerendered at build time and every visitor
gets the build machine's copy of somebody's cards. That is a real leak that no
other check in this plan can see.

Lanes builds no consent banner, so this check is meaningful here — nothing is
forcing every route dynamic for unrelated reasons.

### 4 — Lint

```bash
npm pkg get scripts.lint
```

Run whatever is actually there. Errors block, warnings don't — that is already
ESLint's exit-code behaviour, so don't add `--max-warnings 0`. A fix loop
grinding on unused imports is the failure mode.

### 5 — Serve in production mode

```bash
npm start
```

Production on purpose: it exposes the prerender problems `npm run dev` hides.
Background it so the probes can run.

### 6 — Every route answers

```bash
for r in / /sign-in /sign-up /privacy /terms /dashboard /onboarding \
         /settings /settings/account /settings/security /settings/system; do
  printf '%-28s %s\n' "$r" \
    "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://localhost:3000$r")"
done
```

**No 500s.** `200`, or `307` to `/sign-in` for anything in the dashboard group.
**Keep this output** — it is the app's actual surface area, and the
promise-keeping critic gets it verbatim.

Do not blind-probe `route.ts` handlers; a POST with side effects is not a check.

### 7 — Legal, title, discoverability

```bash
for r in /privacy /terms /cookies; do
  printf '%-12s %s\n' "$r" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$r")"
done
```

`/privacy` and `/terms` are `200` **from a cold client with no cookie**.
**`/cookies` must be `404`** — a `200` there is the finding, not the
reassurance.

```bash
curl -s http://localhost:3000/privacy http://localhost:3000/terms \
  | grep -o "Needs your details[^<]*" | sort -u
grep -rniE '\[your |lorem ipsum|company name\]|example\.com' \
  src/app/\(legal\) src/lib/legal.ts || echo "clean"
curl -s http://localhost:3000/ | grep -o '<title>[^<]*'
```

Every line the first grep prints is a field in `src/lib/legal.ts` nobody set.
**That is not a gate failure** — only the user can supply a contact address or a
jurisdiction. It is the hand-off list, and it fails only if it goes unnamed. A
*plausible placeholder* the grep can't see is a gate failure.

`Create Next App` in the title is a failure, not a note.

```bash
for r in /robots.txt /sitemap.xml /llms.txt; do
  printf '%-14s %s\n' "$r" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$r")"
done
curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]+' | sed 's/<loc>//'
ls public/robots.txt public/sitemap.xml 2>/dev/null && echo "SHADOWED" || echo "clean"
```

All three `200`. **No `<loc>` contains `/dashboard`, `/teams`, `/settings`,
`/invite` or `/api`.** Every one absolute, one origin. Compare both ways against
the step 6 sweep — a public page missing from the sitemap is the more common
miss.

### 8 — The user signs up first

> Open http://localhost:3000 and sign up — the first account becomes the admin.
> Tell me when it's done and I'll finish the checks.

**This is not politeness.** F11 makes the first account created the platform
admin, so a probe fixture signed into an empty database becomes the admin — and
deleting it afterwards leaves the user locked out of their own system page.
Asking costs thirty seconds and makes both fixtures ordinary users, which is
what the isolation probe needs.

### 9 — Two accounts

```bash
JAR=$(mktemp -d)
for u in a b; do
  curl -s -c "$JAR/$u.jar" -X POST http://localhost:3000/api/auth/sign-up/email \
    -H 'content-type: application/json' \
    -d "{\"name\":\"Check $u\",\"email\":\"check-$u@example.test\",\"password\":\"check-passphrase-$u\"}"
done

curl -s -b "$JAR/a.jar" http://localhost:3000/api/auth/get-session
curl -s -o /dev/null -w '%{http_code}\n'                http://localhost:3000/dashboard   # 307
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/a.jar" http://localhost:3000/dashboard   # 200/307→onboarding
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/b.jar" http://localhost:3000/settings/system
curl -s -b "$JAR/a.jar" -X POST http://localhost:3000/api/auth/sign-out
curl -s -b "$JAR/a.jar" http://localhost:3000/api/auth/get-session                         # empty
```

On `/settings/system` as a non-admin, **anything other than `200` is the pass**,
but a `500` is worth noting — F12 requires a clean refusal rather than a stack
trace.

### 10 — Cross-tenant isolation — **the check this app most needs**

Lanes' whole shape is tenants. This is where a leak would live.

Seed, directly at the database layer: account A in organisation *Alpha* with
team *Alpha-Eng*, a board, columns and a card. Account B in organisation *Beta*
with its own team, board and card. Then, over HTTP:

```bash
# B asking for A's board page
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/b.jar" \
  "http://localhost:3000/teams/<A_TEAM_ID>"                    # 404, never 200, never 403
# B asking for A's board state endpoint
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/b.jar" \
  "http://localhost:3000/api/boards/<A_BOARD_ID>/state"        # 404
# B asking for A's members page
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/b.jar" \
  "http://localhost:3000/teams/<A_TEAM_ID>/members"            # 404
# A's own access still works
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR/a.jar" \
  "http://localhost:3000/teams/<A_TEAM_ID>"                    # 200
```

**`403` is a finding, not a pass** — it confirms the resource exists.

Then the mutation paths, which the read probes do not cover. Server actions are
awkward to script, so exercise these deliberately (through the UI with a second
browser profile, or by calling the action directly in a test harness) and record
what happened:

- `moveCard` with **A's card id** and **B's column id** → refused (F06's
  same-board assertion).
- `moveCard` with A's card id as B → not found.
- `createInviteLink` as an **organisation Member** → refused.
- `createInviteLink` for role `owner` as an **organisation Admin** → refused.
- `createColumn` as a Member → refused.
- `authClient.updateUser({ role: "admin" })` → the role does not change.
- `organization.setActive()` with an organisation the user doesn't belong to →
  refused.

Then remove the fixtures and prove they're gone. **The remaining account is the
user's own, still `admin`.** A stray `check-a@example.test` in someone's
brand-new app is exactly what makes a scaffold feel like a scaffold.

### 11 — With the keys taken away

**Never blank environment variables in the shell** — emptying one and letting
`.env` repopulate it is the check passing while testing nothing, and on Windows
assigning an empty string deletes the variable outright.

Use Next's file precedence: `.env.production.local` loads before `.env` and
nothing overwrites a key already set.

- **Only create it if it doesn't already exist.** If it does, skip and say so.
- **Never write to `.env`.**
- Write `RESEND_API_KEY=` and `RESEND_WEBHOOK_SECRET=`, restart in production
  mode, re-run the step 6 sweep, stop.
- **Delete it, then assert it is gone before anything else happens.** A leftover
  blanking file disables the user's integrations in every future production
  build — worse than skipping the check.

```bash
grep -rn "process\.env\.[A-Z_]*!" src/ || echo "clean"
grep -rn "NEXT_PUBLIC_" src/ || echo "clean"
```

The first finds non-null assertions on keys that may be absent — a module that
throws at import time. The second finds anything shipped to the browser; that
prefix makes a value public, so a secret behind one is already leaked.

### 12 — Stop what you started

`npm` spawns `next`, which spawns `node` — killing the `npm` process orphans the
server still holding port 3000. Go by what owns the port, and confirm nothing is
listening before moving on.

## Fresh eyes

The gate proves the app builds, serves and answers. It is structurally blind to
whether the app *does anything* — an entirely empty project passes every command
above, because nothing leaks when there is nothing to leak.

**Dispatch four read-only critic subagents in a single message** so they run at
once. They get the build sheet, the project files, and the transcripts captured
above — **not access**. Four agents cannot share a port or a browser, and a
critic that can run things will spend an hour running things. They do not get
the reference files either; that turns a critic back into a runner of the same
checklist that just failed to catch anything.

| Lens | Covers |
| --- | --- |
| **Promise-keeping** | The build sheet in both directions — every noun has a table, every verb has code, **and nothing on the *not in version one* list exists anyway**. Both halves in one head, because splitting them lets the gap-hunter win and nobody enforces scope. |
| **Ownership** | Whose rows each read and write can return. Every place the database is touched: is the session the only source of the current user? The admin boundary refused on the server, not just hidden. No secret rendered, including masked tails and client-component props. |
| **Looks like theirs** | Every string a person sees. The `<title>` actually served. A framework word where Lanes has its own. Empty states that read as breakage. A settings section for something Lanes doesn't have. An email signed with anything but Lanes. Fabricated credibility on the landing page. A legal page describing a different product. |
| **Operability** | The activity log exists and the main action writes to it in Lanes' verbs. The email panel reads the app's own table and shows a reason on failure. Every integration degrades rather than throwing when its key is absent. Nothing prints a key. |

**The build sheet is the only bar** — not what a mature product would have, not
production readiness. Every finding names the promise it breaks; a finding that
can't name one is an opinion. Never in scope: tests, CI, error boundaries,
performance, monitoring, refactors, folder structure, naming, or any sentence
beginning "consider adding". At most five findings each, most serious first.
Finding nothing is a result, not a failure.

### What comes back

- **Only `broken` and `missing` enter the fix loop.** `worth knowing` goes into
  the hand-off verbatim. This is the valve that stops a thorough critic setting
  the agenda.
- A `suspect` finding is **re-checked with a command before it is fixed**. If
  the command disagrees, drop it with one line in the hand-off.
- Fixes touch only the files the finding names. No refactors, no "while I'm in
  here".
- **No fix widens the gate**, and `git diff` against the noted commit confirms
  no suppression was added.
- **No fix is a spec change.** Anything that would add a feature, reverse a
  user decision, or reach into the *not in version one* list is one line at
  hand-off, not a fix.
- Schema fixes: `db:generate`, read the SQL, `db:migrate`, and say so out loud.
  Never `push`, never edit an applied migration, never edit `auth-schema.ts`.
- **Re-run the gate after every round.** A fix that breaks the build is worse
  than the finding it closed.
- Round two re-dispatches only the critics that filed a blocking finding.
  **Two rounds, then stop and report.** Round three is where an agent starts
  changing code it doesn't understand to make a report go away.

**When a critic is wrong:** on what the app *does*, the critic wins — it is
quoting a file, and what you remember writing is not what is on disk. On *why*
it is that way, the build sheet decides. Where a command can settle it, run the
command; it outranks both. A finding you disagree with is **downgraded, never
deleted** — it goes to hand-off with the reason.

## Named as not runnable from here

A skipped check that goes unnamed is a false pass, and it is worse than never
having listed it — the user reads silence as success.

- Dragging a card in a real browser, by pointer and by keyboard.
- Two browser windows seeing each other's moves within ~5 seconds.
- Signing up, confirming an email, and "forgot password" actually resetting a
  password.
- Opening an invite link as a second person, and a revoked link failing.
- Dark mode and a phone-width viewport.
- The Open Graph image *looking right* — `200` proves the route works, not that
  the picture is good.
- Whether the sitemap and canonical URLs are correct for the **real** domain.
  Everything local says `localhost`, which is expected here and wrong in
  production; it is proven by `APP_URL` on the host.
- Real email delivery, which needs a Resend key and a verified domain.

## Acceptance criteria

- [ ] Every command in the gate was run and its output read.
- [ ] Cross-tenant isolation proven by probe: B gets `404` on A's board, board
      state endpoint and members page, and `403` appears nowhere.
- [ ] Every privilege-escalation probe in step 10 was performed and refused.
- [ ] The build's route table shows every team-scoped route as `ƒ`.
- [ ] `.env` is byte-for-byte what it was before the gate ran, and no
      `.env.production.local` is left behind.
- [ ] No probe account, cookie jar or seeded row survives; the user's own
      account is still the admin.
- [ ] `git diff` across the fix rounds contains no suppression, ignore flag, or
      deleted promise.
- [ ] Four critics dispatched, at most two rounds, results reported.
- [ ] Findings disagreed with appear in the hand-off with the reason, rather
      than silently.
- [ ] Every unperformed check is named with what it would need.
