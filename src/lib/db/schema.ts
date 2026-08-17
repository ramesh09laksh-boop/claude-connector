import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { team, user } from "./auth-schema";

// Better Auth's generated tables. Never hand-edited — see F03.
export * from "./auth-schema";

/**
 * Ids, and the one rule that bites:
 *
 * Every table we define uses `uuid().defaultRandom()`. But every id in a Better
 * Auth table is `text`, so any column pointing at a user, team or organisation
 * is `text` too. Declaring it `uuid` looks more consistent and fails at migrate
 * time with a foreign-key type mismatch.
 */

/** One board per team — the unique constraint is what makes that a rule. */
export const board = pgTable("board", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: text("team_id")
    .notNull()
    .unique()
    .references(() => team.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** `board_column`, not `column` — `column` is reserved in SQL. */
export const boardColumn = pgTable(
  "board_column",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("board_column_board_position_idx").on(table.boardId, table.position)],
);

export const card = pgTable(
  "card",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumn.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // `set null`, not cascade: removing a person must not delete their cards.
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dueDate: timestamp("due_date"),
    position: integer("position").notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("card_column_position_idx").on(table.columnId, table.position)],
);

/**
 * Lanes owns the invite *link*; Better Auth still owns the membership it
 * creates. The plugin's own `invitation` table is email-bound by design, which
 * is a different product from the reusable link this app promised.
 */
export const teamInviteLink = pgTable(
  "team_invite_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    organizationId: text("organization_id").notNull(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_invite_link_token_idx").on(table.token),
    index("team_invite_link_team_idx").on(table.teamId),
  ],
);

/** Written before anything is sent, so "why didn't it arrive?" has an answer. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    template: text("template").notNull(),
    // pending | logged | sent | delivered | bounced | complained | failed
    status: text("status").notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("email_log_created_at_idx").on(table.createdAt)],
);

/**
 * `set null` on the user, not cascade — the log outlives the account so
 * "who deleted that?" is still answerable, with an anonymous row left behind.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("activity_log_created_at_idx").on(table.createdAt)],
);
