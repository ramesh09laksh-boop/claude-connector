/**
 * Exercise the Lanes MCP tools with an access token, including the cross-tenant
 * isolation checks.
 *
 *   node scripts/mcp-tool-probe.mjs <access_token> [outsiderTeamId]
 */

const BASE = process.env.LANES_URL ?? "http://localhost:3000";
const TOKEN = process.argv[2];
const OUTSIDER_TEAM_ID = process.argv[3];

if (!TOKEN) throw new Error("usage: node scripts/mcp-tool-probe.mjs <access_token>");

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
  return json.result;
}

const summary = (r) => (r.content?.[0]?.text ?? "").split("\n")[0];
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------- reads
console.log("\nreads");
const me = await call("lanes_get_current_user");
check("lanes_get_current_user", Boolean(me.structuredContent?.userId), summary(me));

const teams = await call("lanes_list_teams");
const team = teams.structuredContent.teams[0];
check("lanes_list_teams", Boolean(team?.teamId), `${team?.teamName} (${team?.role})`);

const board = await call("lanes_get_board", { teamId: team.teamId });
const columns = board.structuredContent.columns;
// Not a fixed count: this runs against whatever the board currently holds.
check(
  "lanes_get_board",
  columns.length > 0 && columns.every((c) => c.columnId && Array.isArray(c.cards)),
  `${columns.length} columns`,
);

const members = await call("lanes_list_team_members", { teamId: team.teamId });
check(
  "lanes_list_team_members",
  members.structuredContent.members.length >= 1,
  `${members.structuredContent.members.length} member(s)`,
);

// ---------------------------------------------------------------- card writes
console.log("\ncard writes");
const todo = columns.find((c) => c.name === "To Do") ?? columns[0];
const doing = columns.find((c) => c.name === "Doing") ?? columns[1];

const created = await call("lanes_create_card", {
  columnId: todo.columnId,
  title: "Ship the MCP connector",
});
const newCard = created.structuredContent.columns
  .find((c) => c.columnId === todo.columnId)
  .cards.find((c) => c.title === "Ship the MCP connector");
check("lanes_create_card", Boolean(newCard), newCard?.cardId);

const updated = await call("lanes_update_card", {
  cardId: newCard.cardId,
  description: "Streamable HTTP at /mcp, OAuth via Better Auth.",
  assigneeId: me.structuredContent.userId,
  dueDate: "2026-09-01T09:00:00.000Z",
});
const updatedCard = updated.structuredContent.columns
  .flatMap((c) => c.cards)
  .find((c) => c.cardId === newCard.cardId);
check(
  "lanes_update_card",
  updatedCard.assignee?.userId === me.structuredContent.userId &&
    updatedCard.dueDate?.startsWith("2026-09-01"),
  `assigned to ${updatedCard.assignee?.name}, due ${updatedCard.dueDate}`,
);

const detail = await call("lanes_get_card", { cardId: newCard.cardId });
check(
  "lanes_get_card",
  detail.structuredContent.columnName === todo.name,
  `${detail.structuredContent.title} in ${detail.structuredContent.columnName}`,
);

const moved = await call("lanes_move_card", {
  cardId: newCard.cardId,
  toColumnId: doing.columnId,
  toIndex: 0,
});
const movedInto = moved.structuredContent.columns.find(
  (c) => c.columnId === doing.columnId,
);
check(
  "lanes_move_card",
  movedInto.cards[0]?.cardId === newCard.cardId,
  `now top of ${movedInto.name}`,
);

const search = await call("lanes_search_cards", { query: "MCP connector" });
check(
  "lanes_search_cards",
  search.structuredContent.total >= 1,
  `${search.structuredContent.total} hit(s)`,
);

const mine = await call("lanes_search_cards", { assignedToMe: true });
check("lanes_search_cards assignedToMe", mine.structuredContent.total >= 1,
  `${mine.structuredContent.total} assigned to me`);

// ---------------------------------------------------------------- column writes
console.log("\ncolumn writes");
// A name nothing else on the board can already have. Reusing a plausible one
// like "In review" meant this picked up the board's existing column instead of
// the one it had just made, and then renamed and emptied real data.
const scratchName = `Probe scratch ${Date.now()}`;
const renamedScratchName = `${scratchName} (renamed)`;

const withColumn = await call("lanes_create_column", {
  teamId: team.teamId,
  name: scratchName,
});
const review = withColumn.structuredContent.columns.find((c) => c.name === scratchName);
check("lanes_create_column", Boolean(review), review?.columnId);

const renamed = await call("lanes_rename_column", {
  columnId: review.columnId,
  name: renamedScratchName,
});
check(
  "lanes_rename_column",
  renamed.structuredContent.columns.some((c) => c.name === renamedScratchName),
);

const order = renamed.structuredContent.columns.map((c) => c.columnId);
const reversed = [...order].reverse();
const reordered = await call("lanes_reorder_columns", {
  teamId: team.teamId,
  orderedIds: reversed,
});
check(
  "lanes_reorder_columns",
  reordered.structuredContent.columns[0].columnId === reversed[0],
  reordered.structuredContent.columns.map((c) => c.name).join(" → "),
);

// Put it back the way it was.
await call("lanes_reorder_columns", { teamId: team.teamId, orderedIds: order });

// ------------------------------------------------- refusals that must happen
console.log("\nrefusals");

const partialOrder = await call("lanes_reorder_columns", {
  teamId: team.teamId,
  orderedIds: [order[0]],
});
check(
  "partial column order refused",
  partialOrder.isError === true,
  summary(partialOrder),
);

// Deleting a column that still holds cards must be refused, and must say how
// many are in the way. Tested on the probe's own scratch column with a card put
// there for the purpose, so the assertion does not depend on what else is on the
// board.
const scratchCard = await call("lanes_create_card", {
  columnId: review.columnId,
  title: "Scratch card for the delete check",
});
const scratchCardId = scratchCard.structuredContent.columns
  .find((c) => c.columnId === review.columnId)
  .cards.find((c) => c.title === "Scratch card for the delete check").cardId;

const unsafeDelete = await call("lanes_delete_column", { columnId: review.columnId });
check(
  "non-empty column delete refused",
  unsafeDelete.isError === true && /still holds 1 card\b/.test(summary(unsafeDelete)),
  summary(unsafeDelete),
);

// Naming a destination is what makes it allowed, and the card must survive.
const safeDelete = await call("lanes_delete_column", {
  columnId: review.columnId,
  moveCardsTo: todo.columnId,
});
check(
  "column delete with a destination moves the cards",
  safeDelete.isError !== true &&
    !safeDelete.structuredContent.columns.some((c) => c.columnId === review.columnId) &&
    safeDelete.structuredContent.columns
      .find((c) => c.columnId === todo.columnId)
      .cards.some((c) => c.cardId === scratchCardId),
  summary(safeDelete),
);

await call("lanes_delete_card", { cardId: scratchCardId });

const badAssignee = await call("lanes_update_card", {
  cardId: newCard.cardId,
  assigneeId: "not-a-member-at-all",
});
check(
  "assigning a stranger refused",
  badAssignee.isError === true,
  summary(badAssignee),
);

if (OUTSIDER_TEAM_ID) {
  const foreignBoard = await call("lanes_get_board", { teamId: OUTSIDER_TEAM_ID });
  check(
    "another org's board is not-found",
    foreignBoard.isError === true && !/permission/i.test(summary(foreignBoard)),
    summary(foreignBoard),
  );

  const foreignSearch = await call("lanes_search_cards", { teamId: OUTSIDER_TEAM_ID });
  check(
    "search scoped to another org returns nothing",
    foreignSearch.structuredContent?.total === 0,
    `total ${foreignSearch.structuredContent?.total}`,
  );
}

// ---------------------------------------------------------------- clean up
console.log("\ncleanup");
const deleted = await call("lanes_delete_card", { cardId: newCard.cardId });
check(
  "lanes_delete_card",
  deleted.isError !== true &&
    !deleted.structuredContent.columns
      .flatMap((c) => c.cards)
      .some((c) => c.cardId === newCard.cardId),
  summary(deleted),
);

console.log(failures === 0 ? "\n✓ all tool checks passed" : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
