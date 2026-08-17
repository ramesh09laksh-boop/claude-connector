# F03 — Authentication

**Depends on:** F02 · **Blocks:** F04, F09, F11

## Purpose

Email-and-password accounts via Better Auth, on the existing Drizzle database.
This feature delivers sign-up, sign-in and sign-out only. Organisations, roles
and teams are F04; password reset and email verification are F09.

## Technical detail

### Package and secret

```bash
npm i better-auth
```

`.env`:

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

### Config

`src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});
```

`provider: "pg"` to match the database branch.

### Schema generation

**Two different "generate" steps, easy to confuse.** The Better Auth CLI writes
Drizzle *table definitions*; `db:generate` turns those into a *SQL migration*:

```bash
npx @better-auth/cli@latest generate --config src/lib/auth.ts \
  --output src/lib/db/auth-schema.ts -y
npm run db:generate
# read the generated SQL
npm run db:migrate
```

Re-export from `src/lib/db/schema.ts` so Drizzle sees them:

```ts
export * from "./auth-schema";
```

### Route and client

- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)` exporting
  `GET` and `POST`.
- `src/lib/auth-client.ts` — `createAuthClient()` from `better-auth/react`,
  re-exporting `signIn`, `signUp`, `signOut`, `useSession`. F04 extends this
  file with the organization client plugin.

### Pages

`/sign-in` and `/sign-up`, built from shadcn form components, calling
`signIn.email` and `signUp.email`. Real copy in Lanes' voice — "Get your team on
one board", not "Welcome back to MyApp". Each shows inline field errors and a
readable message on a failed sign-in that does **not** reveal whether the
address has an account.

## Gotchas

- **`auth-schema.ts` is generated, not authored.** Never tidy its columns, never
  switch its `text` ids to `uuid`. The next CLI run overwrites the edit anyway,
  and editing it breaks the adapter.
- The Better Auth ↔ Drizzle adapter is the one fragile pairing in this stack.
  Re-run the CLI generate after any `better-auth` upgrade and after every change
  to the `betterAuth()` config that touches the schema — F04, F09 and F11 all
  do this.
- **No email verification or password reset yet, deliberately.** Better Auth can
  do both but neither exists until there is a sender. F09 wires them. Do not
  configure `emailVerification` here with a stub.
- Do not add `requireEmailVerification`. F11 builds the nag-banner pattern
  instead, which prompts without locking anyone out over a mistyped address.

## Acceptance criteria

- [ ] Signing up with an email and password succeeds and lands signed in.
- [ ] Signing out, then signing back in with the same credentials, works.
- [ ] The user row is visible in `npm run db:studio`.
- [ ] `src/lib/db/auth-schema.ts` is byte-for-byte what the CLI generated —
      confirmed by re-running the CLI and seeing no diff.
- [ ] `src/lib/db/schema.ts` re-exports the auth schema.
- [ ] `GET /api/auth/get-session` returns a session with a valid cookie and an
      empty result without one.
- [ ] A failed sign-in does not disclose whether the email address exists.
- [ ] Every string on `/sign-in` and `/sign-up` is about Lanes — no framework
      defaults, no "MyApp".
- [ ] `npx tsc --noEmit` clean and `npm run build` succeeds.
