import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Actor } from "@/lib/actor";
import type { BoardState } from "@/lib/boards";
import { runTool } from "./errors";
import {
  createCardFor,
  deleteCardFor,
  getCardFor,
  moveCardFor,
  searchCardsFor,
  updateCardFor,
} from "@/lib/services/cards";
import {
  createColumnFor,
  deleteColumnFor,
  renameColumnFor,
  reorderColumnsFor,
} from "@/lib/services/columns";
import {
  getBoardFor,
  listTeamMembersFor,
  listVisibleTeams,
} from "@/lib/services/workspace";

/**
 * The tool surface an agent drives Lanes through.
 *
 * One server instance per request, built around one `Actor`. The actor is
 * captured in the closure rather than accepted as a tool argument — a `userId`
 * parameter on a tool is a parameter a model can be talked into changing, and
 * the whole point of the OAuth token is that it, and only it, says who this is.
 *
 * Every tool delegates to `lib/services/*`, which run the same guard chain as
 * the browser UI. There is no query in this file.
 */

const teamIdArg = z
  .string()
  .min(1)
  .describe("Team id, as returned by lanes_list_teams.");

const cardIdArg = z
  .string()
  .uuid()
  .describe("Card id (a UUID), as returned by lanes_get_board or lanes_search_cards.");

const columnIdArg = z
  .string()
  .uuid()
  .describe("Column id (a UUID), as returned by lanes_get_board.");

/** A date an agent can read back to us, or nothing at all. */
function due(dueDate: string | null): string {
  return dueDate ? ` due:${dueDate}` : "";
}

/**
 * Board state is returned by every write, so the agent sees the result at once.
 *
 * **Every id goes in this text.** `structuredContent` carries them too, but not
 * every MCP client puts structured output in front of the model — several show
 * only `content`. This tool is documented as the place column and card ids come
 * from, so a summary of names and counts made the whole write surface unusable:
 * with no `columnId` to target, an agent cannot create a card, and cannot delete
 * a column it created by mistake either.
 *
 * Compact on purpose — one line per card — so a large board stays well inside a
 * client's tool-result limit. `lanes_search_cards` is the paginated way through
 * a board too big to print.
 */
function boardSummary(state: BoardState | null): string {
  if (!state) return "The board is no longer available.";

  const header = `${state.boardName} — team ${state.teamName} (teamId: ${state.teamId})`;

  const columns = state.columns.map((column) => {
    const heading = `\n[${column.position}] ${column.name} — ${column.cards.length} card${column.cards.length === 1 ? "" : "s"}  (columnId: ${column.id})`;

    if (column.cards.length === 0) return `${heading}\n    (empty)`;

    const cards = column.cards
      .map(
        (card) =>
          `    ${card.position}. ${card.title}  (cardId: ${card.id})` +
          `${card.assignee ? ` assignee:${card.assignee.name}` : ""}${due(card.dueDate)}`,
      )
      .join("\n");

    return `${heading}\n${cards}`;
  });

  return `${header}\n${columns.join("\n")}`;
}

function boardPayload(state: BoardState | null) {
  return {
    content: [{ type: "text" as const, text: boardSummary(state) }],
    structuredContent: state
      ? {
          boardId: state.boardId,
          boardName: state.boardName,
          teamId: state.teamId,
          teamName: state.teamName,
          columns: state.columns.map((column) => ({
            columnId: column.id,
            name: column.name,
            position: column.position,
            cards: column.cards.map((c) => ({
              cardId: c.id,
              title: c.title,
              description: c.description,
              dueDate: c.dueDate,
              position: c.position,
              assignee: c.assignee
                ? { userId: c.assignee.id, name: c.assignee.name }
                : null,
            })),
          })),
        }
      : {},
  };
}

const boardOutputSchema = {
  boardId: z.string().optional(),
  boardName: z.string().optional(),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  columns: z
    .array(
      z.object({
        columnId: z.string(),
        name: z.string(),
        position: z.number(),
        cards: z.array(
          z.object({
            cardId: z.string(),
            title: z.string(),
            description: z.string().nullable(),
            dueDate: z.string().nullable(),
            position: z.number(),
            assignee: z
              .object({ userId: z.string(), name: z.string() })
              .nullable(),
          }),
        ),
      }),
    )
    .optional(),
};

export function createLanesMcpServer(actor: Actor): McpServer {
  const server = new McpServer(
    { name: "lanes", version: "1.0.0" },
    {
      instructions:
        "Lanes is a team Kanban tool: one board per team, each board a list of " +
        "columns, each column an ordered list of cards. Start with " +
        "lanes_list_teams to find a team id, then lanes_get_board for that " +
        "team's column and card ids — every other tool takes ids from those " +
        "two. Card and column positions are zero-based. You act as the signed-in " +
        "user and can only reach teams they belong to.",
    },
  );

  // ---------------------------------------------------------------- identity

  server.registerTool(
    "lanes_get_current_user",
    {
      title: "Get current user",
      description:
        "The Lanes account this connector is acting for. Use it to confirm who " +
        "you are working as, or to get the user id for assigning cards to them.",
      inputSchema: {},
      outputSchema: {
        userId: z.string(),
        name: z.string(),
        email: z.string(),
        emailVerified: z.boolean(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      runTool(
        async () => actor,
        (a) => ({
          content: [
            {
              type: "text" as const,
              // The userId is here because assigning a card to "me" needs it.
              text:
                `${a.name} <${a.email}>${a.emailVerified ? "" : " (email not confirmed)"}\n` +
                `userId: ${a.userId}`,
            },
          ],
          structuredContent: {
            userId: a.userId,
            name: a.name,
            email: a.email,
            emailVerified: a.emailVerified,
          },
        }),
      ),
  );

  server.registerTool(
    "lanes_list_teams",
    {
      title: "List teams",
      description:
        "Every team this user can open, with its organisation, their role in " +
        "that organisation, and the team's board. Call this first — team ids " +
        "from here are the input to almost every other tool.",
      inputSchema: {},
      outputSchema: {
        teams: z.array(
          z.object({
            teamId: z.string(),
            teamName: z.string(),
            organizationId: z.string(),
            organizationName: z.string(),
            role: z.string(),
            boardId: z.string(),
            boardName: z.string(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      runTool(
        () => listVisibleTeams(actor),
        (teams) => ({
          content: [
            {
              type: "text" as const,
              text: teams.length
                ? teams
                    .map(
                      (t) =>
                        `${t.teamName} — ${t.organizationName} (you are ${t.role})\n  teamId: ${t.teamId}`,
                    )
                    .join("\n")
                : "This user isn't on any teams yet. They can create one in Lanes at /teams.",
            },
          ],
          structuredContent: { teams },
        }),
      ),
  );

  server.registerTool(
    "lanes_list_team_members",
    {
      title: "List team members",
      description:
        "Who is in a team, and which of them a card can be assigned to. Use " +
        "this to turn a person's name into the userId that lanes_update_card " +
        "needs for assigneeId.",
      inputSchema: { teamId: teamIdArg },
      outputSchema: {
        teamId: z.string(),
        teamName: z.string(),
        members: z.array(
          z.object({
            userId: z.string(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
            assignable: z.boolean(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ teamId }) =>
      runTool(
        () => listTeamMembersFor(actor, teamId),
        (result) => ({
          content: [
            {
              type: "text" as const,
              text: result.members
                .map(
                  (m) =>
                    `${m.name} <${m.email}> — ${m.role}${m.assignable ? "" : " (not on this team; cannot be assigned)"}\n  userId: ${m.userId}`,
                )
                .join("\n"),
            },
          ],
          structuredContent: result,
        }),
      ),
  );

  // ------------------------------------------------------------------ boards

  server.registerTool(
    "lanes_get_board",
    {
      title: "Get board",
      description:
        "A team's whole board: every column in order, and every card in each " +
        "column in order. This is where column ids and card ids come from.",
      inputSchema: { teamId: teamIdArg },
      outputSchema: boardOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ teamId }) =>
      runTool(
        () => getBoardFor(actor, teamId),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_get_card",
    {
      title: "Get card",
      description:
        "One card in full — description, assignee, due date — with the column, " +
        "board and team it sits in.",
      inputSchema: { cardId: cardIdArg },
      outputSchema: {
        cardId: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        dueDate: z.string().nullable(),
        position: z.number(),
        assignee: z
          .object({ userId: z.string(), name: z.string(), email: z.string() })
          .nullable(),
        columnId: z.string(),
        columnName: z.string(),
        boardId: z.string(),
        boardName: z.string(),
        teamId: z.string(),
        teamName: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ cardId }) =>
      runTool(
        () => getCardFor(actor, { cardId }),
        (card) => ({
          content: [
            {
              type: "text" as const,
              // The three ids a follow-up call needs — move it, re-assign it, or
              // look at the rest of its board — rather than only prose.
              text: [
                `${card.title}`,
                `${card.teamName} › ${card.columnName}`,
                `cardId: ${card.cardId}`,
                `columnId: ${card.columnId}`,
                `teamId: ${card.teamId}`,
                card.assignee
                  ? `assignee: ${card.assignee.name} (userId: ${card.assignee.userId})`
                  : "assignee: nobody",
                card.dueDate ? `due: ${card.dueDate}` : "due: not set",
                card.description ? `\n${card.description}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          structuredContent: { ...card },
        }),
      ),
  );

  server.registerTool(
    "lanes_search_cards",
    {
      title: "Search cards",
      description:
        "Find cards across every board this user can open. Filters combine with " +
        "AND. With no filters it returns the most recently updated cards. " +
        "Results are paginated — check `total` and page with offset.",
      inputSchema: {
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Case-insensitive substring match on title and description."),
        teamId: z
          .string()
          .optional()
          .describe("Restrict to one team. Omit to search every team you can see."),
        assigneeId: z
          .string()
          .optional()
          .describe("Only cards assigned to this userId (see lanes_list_team_members)."),
        assignedToMe: z
          .boolean()
          .optional()
          .describe("Only cards assigned to the connected user."),
        unassigned: z.boolean().optional().describe("Only cards with no assignee."),
        dueBefore: z
          .string()
          .datetime()
          .optional()
          .describe("ISO 8601 timestamp. Only cards due at or before this."),
        dueAfter: z
          .string()
          .datetime()
          .optional()
          .describe("ISO 8601 timestamp. Only cards due at or after this."),
        limit: z.number().int().min(1).max(100).optional().describe("Default 25."),
        offset: z.number().int().min(0).optional().describe("Default 0."),
      },
      outputSchema: {
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
        hits: z.array(
          z.object({
            cardId: z.string(),
            title: z.string(),
            description: z.string().nullable(),
            dueDate: z.string().nullable(),
            assignee: z.object({ userId: z.string(), name: z.string() }).nullable(),
            columnId: z.string(),
            columnName: z.string(),
            teamId: z.string(),
            teamName: z.string(),
            updatedAt: z.string(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(
        () => searchCardsFor(actor, args),
        (result) => ({
          content: [
            {
              type: "text" as const,
              text: result.hits.length
                ? `${result.total} match${result.total === 1 ? "" : "es"}, showing ${result.offset + 1}–${result.offset + result.hits.length}\n\n` +
                  result.hits
                    .map(
                      (h) =>
                        `${h.title} — ${h.teamName} › ${h.columnName}` +
                        `${h.assignee ? ` · ${h.assignee.name}` : ""}${h.dueDate ? ` · due ${h.dueDate}` : ""}\n` +
                        // columnId and teamId as well as cardId: moving a card
                        // found here needs the column it is in, and a search can
                        // span several boards.
                        `  cardId: ${h.cardId}  columnId: ${h.columnId}  teamId: ${h.teamId}`,
                    )
                    .join("\n")
                : "No cards matched.",
            },
          ],
          structuredContent: { ...result },
        }),
      ),
  );

  // ------------------------------------------------------------------- cards

  server.registerTool(
    "lanes_create_card",
    {
      title: "Create card",
      description:
        "Add a card to the bottom of a column. Set the description, assignee or " +
        "due date afterwards with lanes_update_card. Returns the updated board.",
      inputSchema: {
        columnId: columnIdArg,
        title: z.string().min(1).max(200).describe("The card's title."),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => createCardFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_update_card",
    {
      title: "Update card",
      description:
        "Change a card's title, description, assignee or due date. Only the " +
        "fields you pass are changed; pass null to description, assigneeId or " +
        "dueDate to clear them. Returns the updated board.",
      inputSchema: {
        cardId: cardIdArg,
        title: z.string().min(1).max(200).optional(),
        description: z
          .string()
          .max(5000)
          .nullable()
          .optional()
          .describe("Pass null to clear."),
        assigneeId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "A userId from lanes_list_team_members with assignable=true. Pass null to unassign.",
          ),
        dueDate: z
          .string()
          .datetime()
          .nullable()
          .optional()
          .describe("ISO 8601 timestamp, or null to clear."),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => updateCardFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_move_card",
    {
      title: "Move card",
      description:
        "Move a card to a position in a column — this is how work advances from " +
        "one lane to the next. toIndex is zero-based and clamped to the " +
        "column's length. The destination column must be on the same board. " +
        "Returns the updated board.",
      inputSchema: {
        cardId: cardIdArg,
        toColumnId: columnIdArg.describe(
          "Destination column id. Must belong to the same board as the card.",
        ),
        toIndex: z
          .number()
          .int()
          .min(0)
          .describe("Zero-based position within the destination column. 0 is the top."),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => moveCardFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_delete_card",
    {
      title: "Delete card",
      description:
        "Permanently delete a card. This cannot be undone — prefer moving it to " +
        "a 'Done' column unless deletion was actually asked for. Returns the " +
        "updated board.",
      inputSchema: { cardId: cardIdArg },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => deleteCardFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  // ----------------------------------------------------------------- columns

  server.registerTool(
    "lanes_create_column",
    {
      title: "Create column",
      description:
        "Add a column to the right-hand end of a team's board. Requires admin " +
        "or owner in the organisation. Returns the updated board.",
      inputSchema: {
        teamId: teamIdArg,
        name: z.string().min(1).max(80).describe("The column's name, e.g. 'In review'."),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => createColumnFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_rename_column",
    {
      title: "Rename column",
      description:
        "Rename a column. Requires admin or owner in the organisation. Returns " +
        "the updated board.",
      inputSchema: {
        columnId: columnIdArg,
        name: z.string().min(1).max(80),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => renameColumnFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_delete_column",
    {
      title: "Delete column",
      description:
        "Delete a column. If it still holds cards you must say where they go " +
        "with moveCardsTo, or the call is refused and tells you how many are in " +
        "the way — cards are never silently deleted with their column. Requires " +
        "admin or owner. Returns the updated board.",
      inputSchema: {
        columnId: columnIdArg,
        moveCardsTo: columnIdArg
          .nullish()
          .describe(
            "Where this column's cards should go. Another column on the same board. Required if the column is not empty.",
          ),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => deleteColumnFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  server.registerTool(
    "lanes_reorder_columns",
    {
      title: "Reorder columns",
      description:
        "Set the left-to-right order of a board's columns. orderedIds must list " +
        "every column on the board exactly once — a partial list is refused. " +
        "Requires admin or owner. Returns the updated board.",
      inputSchema: {
        teamId: teamIdArg,
        orderedIds: z
          .array(z.string().uuid())
          .min(1)
          .describe(
            "Every column id on this board, in the order they should appear left to right.",
          ),
      },
      outputSchema: boardOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        () => reorderColumnsFor(actor, args),
        (state) => boardPayload(state),
      ),
  );

  return server;
}
