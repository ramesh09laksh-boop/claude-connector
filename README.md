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
| MCP server | `/mcp` — an AI agent works the boards as the signed-in user |

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

## The MCP server

Lanes exposes a remote [MCP](https://modelcontextprotocol.io) server at `/mcp`,
so an agent can work the boards on a person's behalf. It installs as a
[Claude connector](https://claude.com/docs/connectors/building): in Claude, go to
**Settings → Connectors → Add custom connector** and give it

```
https://your-lanes-domain.example.com/mcp
```

There is nothing to paste beyond the URL. The server advertises OAuth 2.1 with
dynamic client registration, so Claude registers itself, sends you here to sign
in, shows you a consent screen naming the client and where it will send you back,
and takes it from there. Locally, `http://localhost:3000/mcp` works with the MCP
Inspector and with `claude mcp add`.

**An agent gets exactly the access the person does, and no more.** Tool calls run
the same guards as the browser — `src/lib/board-guards.ts` — so a card in another
organisation is as invisible over MCP as it is in the UI. Reading and writing
boards, columns and cards is the whole surface: creating teams, changing
someone's role, minting invite links and anything to do with account settings are
deliberately *not* exposed, and stay in the UI where a person does them
deliberately.

| Tool | |
| --- | --- |
| `lanes_get_current_user` | Who the connector is acting as |
| `lanes_list_teams` | Teams this person can open — start here |
| `lanes_list_team_members` | Who is on a team, and who a card can be assigned to |
| `lanes_get_board` | One team's columns and cards, in order |
| `lanes_get_card` | One card in full |
| `lanes_search_cards` | Across every visible board, by text, assignee or due date |
| `lanes_create_card` `lanes_update_card` `lanes_move_card` `lanes_delete_card` | |
| `lanes_create_column` `lanes_rename_column` `lanes_delete_column` `lanes_reorder_columns` | Admin or owner |

`APP_URL` (or `BETTER_AUTH_URL`) **must** be the public HTTPS origin in
production. The OAuth issuer and the `resource` identifier in
`/.well-known/oauth-protected-resource` are both derived from it, and Claude
compares that `resource` against the URL you typed — a stale value fails the
connection rather than merely producing an odd sitemap.

To exercise the whole flow without a browser:

```bash
node scripts/mcp-oauth-probe.mjs                 # DCR → PKCE → consent → token
node scripts/mcp-tool-probe.mjs <access_token>   # every tool, plus the refusals
```

## Environment

`.env` holds the local values; nothing secret is ever committed.

| Variable | Needed for |
| --- | --- |
| `POSTGRES_URL` | The database — required, at build time as well as runtime |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions |
| `RESEND_API_KEY` | Sending email for real. Empty means "print to the terminal" |
| `RESEND_WEBHOOK_SECRET` | Turning `sent` into `delivered` / `bounced` |
| `APP_URL` | The public address — sitemap, canonical links, and the MCP server's OAuth identity |

`APP_URL` should be a full address — `https://lanes.example.com`, not
`lanes.example.com`. A bare host is accepted and assumed to be `https`, but the
Settings → System page is the place to confirm it was understood.

Every integration switches on the presence of its variable, so the app runs end
to end with none of the optional ones set.

## Before it goes live

- Set `entity`, `contactEmail` and `jurisdiction` in `src/lib/legal.ts`. Until
  you do, the privacy and terms pages show a yellow marker where each one
  belongs, rather than a plausible-looking placeholder.
- Set `APP_URL` on the host, or the sitemap and canonical links say
  `localhost` — and the MCP connector will not connect at all.
- Add a Resend key and a verified domain to email anyone other than yourself.
