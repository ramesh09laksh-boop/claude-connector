# F02 — Database & migrations

**Depends on:** F01 · **Blocks:** F03 and everything downstream

## Purpose

Postgres running locally in Docker, Drizzle ORM wired to it, and a migration
workflow that produces a reviewable artefact for every schema change — from the
very first table.

## Technical detail

### Packages

```bash
npm i drizzle-orm pg
npm i -D drizzle-kit @types/pg
```

### Docker

`docker-compose.yml` at the project root:

```yaml
services:
  db:
    image: postgres:alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

The image tag carries no version on purpose so a fresh project gets current
stable Postgres. Worth knowing rather than acting on: a Postgres data directory
belongs to the major version that created it, so once there is real data, an
image that moves to a new major refuses to start against the old volume. The fix
is a dump and restore, and *that* is the moment to pin the major — not now.

### Connection

`.env`:

```
POSTGRES_URL=postgresql://app:app@localhost:5432/app
```

`drizzle.config.ts` at the root — `dialect: "postgresql"`, schema
`./src/lib/db/schema.ts`, out `./drizzle`, credentials from
`process.env.POSTGRES_URL`.

`src/lib/db/index.ts` — `drizzle` from `drizzle-orm/node-postgres` over a `pg`
`Pool` built from `POSTGRES_URL`, with `{ schema }`.

### Scripts

```json
"db:up":       "docker compose up -d",
"db:down":     "docker compose down",
"db:generate": "drizzle-kit generate",
"db:migrate":  "drizzle-kit migrate",
"db:studio":   "drizzle-kit studio",
"build":       "npm run db:migrate && next build"
```

**`build` running migrations is not optional.** Without it a deploy ships new
code against an old schema: migration files are committed but nothing on the
host ever applies them, and the first request touching a new column fails at
runtime. It is a no-op when nothing is pending, so `npm run build` stays safe to
run any time. This does mean the deployed environment needs `POSTGRES_URL` at
**build** time, not just runtime.

**`db:push` is deliberately absent** and must never be added.

### Schema file

`src/lib/db/schema.ts` starts effectively empty — it gains
`export * from "./auth-schema"` in F03 and the app's own tables in F06. Table
definitions and the id conventions live in
[`implementation-plan.md` §4](../implementation-plan.md).

## Gotchas

- **Docker Desktop is installed but not running.** `docker compose` fails with a
  daemon connection error, which looks identical to the app being broken. If
  `npm run db:up` fails, the fix is to start Docker Desktop — not to debug the
  app. Confirm with `docker compose ps` before assuming anything downstream.
- Read what `db:generate` produced before `db:migrate` applies it. Drizzle
  cannot always tell a rename from a drop-plus-add, and that distinction is
  visible in the SQL file and invisible if you skip it.
- Going to production changes no code. Docker Compose is a local convenience;
  a deployed app points `POSTGRES_URL` at a hosted Postgres set in the host's
  environment.

## Acceptance criteria

- [ ] `npm run db:up` starts Postgres and `docker compose ps` shows it healthy.
- [ ] `npm run db:generate` produces a migration file in `drizzle/`, and
      `npm run db:migrate` applies it without errors.
- [ ] Inserting and reading one row through `db` works.
- [ ] `npm run db:studio` opens and lists the tables.
- [ ] `package.json` contains no `db:push` script and no `drizzle-kit push`
      anywhere: `grep -n '"db:push"\|drizzle-kit push' package.json` returns
      nothing.
- [ ] `package.json` has `"build": "npm run db:migrate && next build"` and
      `npm run build` completes, running migrations first.
- [ ] `drizzle/` is committed to git, not ignored.
- [ ] With Docker stopped, the failure message is recognisably a database
      connection problem rather than an application crash.
