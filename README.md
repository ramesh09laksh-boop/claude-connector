# Lanes

Every team's work, in its lane.

A Kanban board for teams: an organisation holds teams, each team has exactly
one board, and cards move between columns by drag and drop — by pointer or by
keyboard. Sign-in is email and password.

## Running it

Docker Desktop needs to be running.

```bash
npm run db:up      # Postgres in Docker
npm run db:migrate # apply migrations
npm run dev        # http://localhost:3000
```

**Sign up first.** The first account created on an instance becomes the
platform admin, which is the only account that can see `/settings/system`.

## What's here

| | |
| --- | --- |
| Organisations, teams, roles | Better Auth's `organization` plugin with teams enabled |
| One board per team | Enforced by a unique constraint on `board.team_id` |
| Drag and drop | `@dnd-kit` — space to lift, arrows to move, space to drop |
| Live updates | The board polls every 3 seconds; unchanged polls answer `204` |
| Invite links | Reusable, role-baked, expiring, revocable — `team_invite_link` |
| Email | Resend. With no API key set, messages print to the terminal |
| System page | What's configured, what happened, and every email sent |

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Runs migrations, then builds |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run db:generate` | Write a migration from the schema — **read the SQL** |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |
| `npm run email:dev` | Preview the email templates |

There is deliberately no `db:push`. Every schema change produces a reviewable
migration in `drizzle/`, which is committed as source code.

## Environment

`.env` holds the local values; nothing secret is ever committed.

| Variable | Needed for |
| --- | --- |
| `POSTGRES_URL` | The database — required, at build time as well as runtime |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions |
| `RESEND_API_KEY` | Sending email for real. Empty means "print to the terminal" |
| `RESEND_WEBHOOK_SECRET` | Turning `sent` into `delivered` / `bounced` |
| `APP_URL` | The public address, used by the sitemap and canonical links |

Every integration switches on the presence of its variable, so the app runs end
to end with none of the optional ones set.

## Before it goes live

- Set `entity`, `contactEmail` and `jurisdiction` in `src/lib/legal.ts`. Until
  you do, the privacy and terms pages show a yellow marker where each one
  belongs, rather than a plausible-looking placeholder.
- Set `APP_URL` on the host, or the sitemap and canonical links say
  `localhost`.
- Add a Resend key and a verified domain to email anyone other than yourself.
