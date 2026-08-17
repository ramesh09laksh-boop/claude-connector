# F04 — Organisations, teams & roles

**Depends on:** F03 · **Blocks:** F05, F06, F10

## Purpose

The structural spine of the app: organisations, teams inside them, and a role per
person per organisation. Every tenant-scoped query in every later feature is
scoped by what this feature establishes, so the guard module built here is the
single most security-critical file in the project.

## Technical detail

### The plugin

Better Auth's `organization` plugin, with teams enabled. It provides
organisations, members, roles, teams, team members, `activeOrganizationId` and
`activeTeamId` on the session, and an access-control system for custom
permissions.

**This is not a build-versus-buy question.** The rule is that Better Auth owns
anything belonging to a user; hand-rolling multi-tenancy beside it produces two
disagreeing ideas of who a person is, and membership rows that sessions know
nothing about.

Tables the plugin generates: `organization`, `member`, `invitation`, `team`,
`teamMember`, plus `activeOrganizationId` / `activeTeamId` columns on `session`.

`invitation` exists because the plugin creates it. **F05 does not use it** — see
that file for why.

### Access control

`src/lib/permissions.ts`:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,               // organization, member, invitation, team
  card:   ["create", "update", "delete"],
  column: ["create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({ card: ["create", "update", "delete"] });

export const admin = ac.newRole({
  card:       ["create", "update", "delete"],
  column:     ["create", "update", "delete"],
  team:       ["create", "update", "delete"],
  member:     ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const owner = ac.newRole({
  ...statement,                        // everything, including organization:delete
});
```

Passed to the plugin as `ac` and `roles: { owner, admin, member }`. Exact import
paths and the shape of `defaultStatements` are confirmed by the Phase 0 currency
check — this is the fastest-moving dependency in the stack.

Role capabilities, matching the build sheet exactly:

| | Owner | Admin | Member |
| --- | --- | --- | --- |
| Create/edit/delete/drag cards, assign, due dates | ✓ | ✓ | ✓ |
| Add/rename/delete/reorder columns | ✓ | ✓ | |
| Create teams, invite, remove, change roles | ✓ | ✓ | |
| Delete the organisation, transfer ownership | ✓ | | |

### Client plugin

`src/lib/auth-client.ts` gains the `organizationClient` plugin with the same
`ac` and `roles`, so `authClient.organization.*` and client-side
`checkRolePermission` are available.

### The guard module

`src/lib/board-guards.ts`, `import "server-only"`. **Every read and write in
F05–F08 goes through this file.**

```ts
requireUser(): Promise<Session>
requireOrgMember(organizationId: string): Promise<{ session; role }>
requireOrgPermission(organizationId, permissions): Promise<{ session; role }>
requireTeamAccess(teamId: string): Promise<{ session; role; team; board }>
requireCardAccess(cardId: string, permissions): Promise<{ session; role; card }>
```

`requireTeamAccess` resolves the team's `organizationId` from the `team` table,
asserts a `member` row for the session user, asserts a `teamMember` row, and
returns the team with its board. `requireCardAccess` walks
`card → board_column → board → team → organization` from the card id alone.

Permission checks use `auth.api.hasPermission({ headers, body: { permissions } })`
— server-side, against the session's active organisation. The client-side
`checkRolePermission` is for **hiding controls only**; it is presentation, never
the boundary.

**Failures throw a typed `NotFoundError`, and pages render `notFound()`.** A
`403` on a resource in another organisation confirms that resource exists. A
`404` does not.

### UI

- **Organisation switcher** in the app shell — `authClient.organization.list()`
  and `setActive()`. Persists via `activeOrganizationId` on the session.
- **Team switcher / team list** for the active organisation.
- **`/onboarding`** — a brand-new account has no organisation, so `/dashboard`
  redirects here. One form creates the organisation, a first team, that team's
  board, and its three default columns **in one transaction**, then lands on the
  board. A partial failure must not leave an organisation with no team.
- **`/teams/[teamId]/members`** — Owner/Admin only. Lists members with role,
  offers role change and removal, and hosts the invite-link panel from F05.
  Owner rows cannot be removed or demoted by an Admin.

### Team creation side effects

Creating a team always creates its `board` row and seeds **To Do / Doing /
Done**, in the same transaction. A team without a board is an invalid state the
board page would have to defend against; making it impossible is cheaper.

## Gotchas

- **`organizationId` and `teamId` columns are `text`**, matching the plugin's
  generated ids. Not `uuid`.
- The plugin config changes the schema, so: CLI generate → `db:generate` → read
  the SQL → `db:migrate`.
- **Never trust an `organizationId` or `teamId` from the client.** The one id a
  URL legitimately carries is the `teamId` in the route; everything above it is
  resolved server-side. A posted `organizationId` is a value someone can change.
- `setActive()` must itself verify membership — switching to an organisation you
  do not belong to is otherwise a one-line privilege escalation.
- The last Owner of an organisation cannot be demoted or removed. F11's account
  deletion hits the same rule from the other side.

## Acceptance criteria

- [ ] A new account is redirected to `/onboarding`, and one submission creates
      the organisation, a team, its board, and To Do / Doing / Done.
- [ ] Killing the process mid-onboarding leaves no organisation without a team,
      and no team without a board (verify the transaction, e.g. by forcing an
      error in the final step).
- [ ] A user in two organisations can switch between them, and the choice
      survives a page reload.
- [ ] `setActive()` with an organisation the user does not belong to is refused
      by the server.
- [ ] A Member sees no "add column" or "invite" controls, **and** the
      corresponding server actions refuse them when called directly — proven by
      calling the action, not by looking at the UI.
- [ ] An Admin cannot remove or demote an Owner.
- [ ] The last Owner cannot be demoted or removed.
- [ ] Requesting `/teams/<a team in another organisation>` returns `404`, never
      `403` and never `200`.
- [ ] `src/lib/db/auth-schema.ts` matches a fresh CLI generate exactly.
- [ ] Every mutation writes an activity row: `organization.created`,
      `team.created`, `member.role_changed`, `member.removed`.
- [ ] `npx tsc --noEmit` clean and `npm run build` succeeds.
