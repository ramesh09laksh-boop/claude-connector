# F06 — Board domain & server actions

**Depends on:** F04 · **Blocks:** F07, F08

## Purpose

The board's back end: the three tables, the one query that produces board state,
the ordering algorithm, and every server action that mutates a card or a column.
No UI in this feature.

## Technical detail

### Tables — `src/lib/db/schema.ts`

```ts
export const board = pgTable("board", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: text("team_id").notNull().unique()
    .references(() => team.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const boardColumn = pgTable("board_column", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull()
    .references(() => board.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const card = pgTable("card", {
  id: uuid("id").primaryKey().defaultRandom(),
  columnId: uuid("column_id").notNull()
    .references(() => boardColumn.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: text("assignee_id")
    .references(() => user.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  position: integer("position").notNull(),
  createdById: text("created_by_id")
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

Notes that are not stylistic:

- **`board.teamId` is `text` and unique.** `text` because `team` is a Better Auth
  table with `text` ids; unique because "one board per team" is a rule the
  database should enforce rather than a convention the code remembers.
- **`board_column`, not `column`** — `column` is a reserved word in SQL and a
  needless fight with every tool that touches the schema.
- `assigneeId` and `createdById` are `set null`, not cascade. Removing a person
  from the organisation must not delete the cards they wrote.
- Index `board_column(board_id, position)` and `card(column_id, position)`.

### Board state — `src/lib/boards.ts`

```ts
export async function getBoardState(teamId: string): Promise<BoardState>
```

One function, one shape, **two callers** — the server component in F07 and the
polling route in F08. Two rendering paths over two slightly different shapes is
how a board starts disagreeing with itself.

Returns board id and name, columns ordered by `position`, each with its cards
ordered by `position`, each card carrying its assignee's id, name and image.
Loaded in one query with joins, not N+1 per column.

Also export `getBoardStateVersion(teamId)` — `max(card.updatedAt)` across the
board plus a card count — so F08's poll can cheaply detect "nothing changed".

### Ordering

`position` is a dense integer per column, `0..n-1`, and **every move rewrites
the positions of the affected column(s) inside one transaction**.

Rejected alternatives, with the reason:

- **Fractional floats** (insert at the midpoint) run out of double precision
  after ~50 consecutive inserts into the same gap, and then silently stop
  ordering correctly.
- **A ranking library** (LexoRank, fractional-indexing) solves a problem this
  app does not have at tens of cards per column, at the cost of a dependency and
  a string key nobody can read in `db:studio`.

Dense renumbering is one `UPDATE` per affected column, completely
deterministic, and makes concurrent moves converge rather than drift.

### Server actions — `src/lib/actions/`

Every one: guard first, validate second, mutate third, log fourth,
`revalidatePath` last.

| Action | Guard | Notes |
| --- | --- | --- |
| `createCard({ columnId, title })` | `card:create` via column → board → team | Appends at `position = count` |
| `updateCard({ cardId, title?, description?, assigneeId?, dueDate? })` | `requireCardAccess(cardId, { card: ["update"] })` | Assignee must be a member of **this team** |
| `deleteCard({ cardId })` | `card:delete` | Renumbers the source column |
| `moveCard({ cardId, toColumnId, toIndex })` | `card:update` | See below |
| `createColumn({ teamId, name })` | `column:create` | Appends at the end |
| `renameColumn({ columnId, name })` | `column:update` | |
| `deleteColumn({ columnId })` | `column:delete` | Refuses if it holds cards, or asks where they go — never silently deletes cards |
| `reorderColumns({ teamId, orderedIds })` | `column:update` | Validates the set matches exactly |

**`moveCard` is the one to get right:**

1. `requireCardAccess(cardId, { card: ["update"] })` — resolves
   `card → board_column → board → team → organization` server-side.
2. Assert `toColumnId` belongs to **the same board**. Without this, a valid card
   id plus a column id from another organisation moves a card across tenants.
3. Clamp `toIndex` into range.
4. In one transaction: renumber the source column without the card, insert the
   card into the destination at `toIndex`, renumber the destination.
5. `card.updatedAt = now()` so F08's version check sees the change.
6. `logActivity("card.moved", { cardId, from, to })`.

All input validated with a schema (Zod or equivalent) — a server action is a
public HTTP endpoint with a nicer calling convention, not a trusted function.

## Gotchas

- **Never trust `toColumnId`.** It is the cross-tenant hole in this feature.
- Never take `teamId` from the client for a card operation; derive it from the
  card.
- `deleteColumn` on a column with cards must be an explicit decision, not a
  cascade the user discovers afterwards.
- An assignee must be a member of the team — accepting any `userId` lets someone
  assign a card to a stranger and leaks that person's name onto the board.
- `updatedAt` must actually update on every mutation, or the poll goes blind.

## Acceptance criteria

- [ ] Migration applies cleanly; `board.team_id` has a unique constraint.
- [ ] Creating a team creates exactly one board with three columns.
- [ ] `getBoardState` returns columns and cards in `position` order and issues a
      bounded number of queries regardless of column count (no N+1).
- [ ] `moveCard` within a column reorders correctly; across columns it removes
      from the source and inserts at the right index in the destination.
- [ ] After any sequence of moves, every column's positions are exactly
      `0..n-1` with no gaps or duplicates.
- [ ] **`moveCard` with a `toColumnId` from another board is refused** — proven
      by calling the action directly with a real id from a second organisation.
- [ ] `moveCard` with a card id from another organisation returns not-found.
- [ ] `updateCard` with an `assigneeId` who is not a member of the team is
      refused.
- [ ] A Member can create, edit, delete and move cards.
- [ ] A Member calling `createColumn`, `renameColumn`, `deleteColumn` or
      `reorderColumns` directly is refused by the server.
- [ ] `deleteColumn` on a column holding cards does not silently destroy them.
- [ ] Every mutation writes an activity row using Lanes' verbs — `card.created`,
      `card.moved`, `card.updated`, `card.deleted`, `column.created`,
      `column.renamed`, `column.deleted`.
- [ ] `card.updatedAt` changes on every mutation including a move.
- [ ] Deleting a user sets `assigneeId` and `createdById` to null and leaves the
      cards intact.
