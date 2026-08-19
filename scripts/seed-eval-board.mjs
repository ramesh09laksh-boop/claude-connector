/**
 * Seed the Engineering board with the content the evaluation questions in
 * `evals/lanes-mcp.xml` are written against.
 *
 * Drives the MCP server itself, so it doubles as a soak test of the write tools.
 * Idempotent: it clears the board's cards first, so re-running restores exactly
 * the state the evaluation answers were verified against.
 *
 *   node scripts/seed-eval-board.mjs <access_token>
 */

const BASE = process.env.LANES_URL ?? "http://localhost:3000";
const TOKEN = process.argv[2];
if (!TOKEN) throw new Error("usage: node scripts/seed-eval-board.mjs <access_token>");

let rpcId = 0;
async function call(name, args = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const frame = text.includes("data:") ? text.split("data:").pop().trim() : text.trim();
  const json = JSON.parse(frame);
  if (json.error) throw new Error(`${name}: ${JSON.stringify(json.error)}`);
  if (json.result?.isError) {
    throw new Error(`${name}: ${json.result.content?.[0]?.text}`);
  }
  return json.result;
}

const teams = await call("lanes_list_teams");
const team = teams.structuredContent.teams.find((t) => t.teamName === "Engineering");
if (!team) throw new Error("Engineering team not found");

const people = await call("lanes_list_team_members", { teamId: team.teamId });
const by = (name) => {
  const m = people.structuredContent.members.find((p) => p.name === name);
  if (!m) throw new Error(`${name} is not on this team — seed the fixtures first`);
  return m.userId;
};
const ada = by("Ada Lovelace");
const grace = by("Grace Hopper");

// Start from a clean board.
let board = await call("lanes_get_board", { teamId: team.teamId });
for (const column of board.structuredContent.columns) {
  for (const card of column.cards) {
    board = await call("lanes_delete_card", { cardId: card.cardId });
  }
}

// Four lanes: the three seeded ones plus a review stage.
board = await call("lanes_get_board", { teamId: team.teamId });
if (!board.structuredContent.columns.some((c) => c.name === "In review")) {
  board = await call("lanes_create_column", { teamId: team.teamId, name: "In review" });
}

const columnId = (name) => {
  const c = board.structuredContent.columns.find((x) => x.name === name);
  if (!c) throw new Error(`no column named ${name}`);
  return c.columnId;
};

// "In review" is created at the end; put it before Done.
await call("lanes_reorder_columns", {
  teamId: team.teamId,
  orderedIds: [
    columnId("To Do"),
    columnId("Doing"),
    columnId("In review"),
    columnId("Done"),
  ],
});
board = await call("lanes_get_board", { teamId: team.teamId });

const CARDS = [
  // column, title, description, assignee, dueDate
  ["To Do", "Write the onboarding email", "First message a new signup gets.", null, null],
  ["To Do", "Fix the board polling", "A rename in another tab never shows up.", null, null],
  ["To Do", "Rotate the Resend API key", "The mail credentials expire every quarter and nobody owns the calendar reminder.", grace, "2026-09-04T09:00:00.000Z"],
  ["To Do", "Draft the Q4 roadmap", "One page, three bets, no gantt chart.", ada, "2026-10-15T17:00:00.000Z"],
  ["To Do", "Audit the cookie banner", "Check what we actually set before consent.", null, "2026-09-30T12:00:00.000Z"],

  ["Doing", "Migrate invite links to signed tokens", "Stop storing the raw bearer value.", ada, "2026-09-10T09:00:00.000Z"],
  ["Doing", "Reduce board query count", "Two queries per board render, not N per column.", grace, "2026-09-02T09:00:00.000Z"],

  ["In review", "Add keyboard shortcuts to the board", "Space to pick a card up, arrows to move it.", grace, "2026-08-28T09:00:00.000Z"],
  ["In review", "Redesign the empty state", "A real empty state, not a blank panel.", ada, null],

  ["Done", "Ship the OAuth consent screen", "Names the client and the host it hands the code to.", ada, "2026-08-18T09:00:00.000Z"],
  ["Done", "Seed default columns for new teams", "To Do, Doing, Done on every new board.", grace, "2026-08-12T09:00:00.000Z"],
  ["Done", "Replace the create-next-app README", "Say what Lanes is on the first screen.", ada, "2026-08-15T09:00:00.000Z"],
];

for (const [column, title, description, assigneeId, dueDate] of CARDS) {
  const after = await call("lanes_create_card", { columnId: columnId(column), title });
  const created = after.structuredContent.columns
    .find((c) => c.name === column)
    .cards.find((c) => c.title === title);

  await call("lanes_update_card", {
    cardId: created.cardId,
    description,
    ...(assigneeId ? { assigneeId } : {}),
    ...(dueDate ? { dueDate } : {}),
  });
  console.log(`  + ${column.padEnd(10)} ${title}`);
}

const final = await call("lanes_get_board", { teamId: team.teamId });
console.log(
  "\n" +
    final.structuredContent.columns
      .map((c) => `${c.name} (${c.cards.length})`)
      .join(" | "),
);
