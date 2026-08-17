# F08 — Live updates (polling)

**Depends on:** F06, F07 · **Blocks:** nothing

## Purpose

A teammate moves a card; you see it within a few seconds without touching
anything. Chosen over server-sent events deliberately: no persistent connection
to keep alive across deploys, no host-specific limits, and nothing extra to run.

## Technical detail

### The endpoint

`src/app/api/boards/[boardId]/state/route.ts`

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

`GET` → `requireBoardAccess(boardId)` (a thin wrapper over
`requireTeamAccess` that resolves the team from the board) → `getBoardState()`
→ JSON.

**It returns the same shape the server component rendered from**, because it
calls the same `getBoardState` in `src/lib/boards.ts`. One function, one shape,
two callers.

Support `?v=<version>` — when the client's version matches
`getBoardStateVersion()`, respond `204 No Content` and skip serialising the
board. Most polls change nothing, and this makes the steady-state cost a
timestamp comparison rather than a full board render.

Cache headers: `Cache-Control: no-store`. A cached board is a stale board.

### The hook

`src/hooks/use-board-poll.ts` — `useBoardPoll(boardId, currentVersion, onState)`.

A 3-second interval, with four rules that are each a real bug if omitted:

1. **Skip while a drag is in flight.** A poll landing mid-drag yanks the board
   out from under the cursor.
2. **Skip while the tab is hidden** (`document.visibilityState`), and fetch once
   immediately on becoming visible. Otherwise every background tab polls
   forever.
3. **Skip while a card dialog has unsaved edits.** Overwriting someone's
   half-typed description with a poll result is the worst failure this feature
   can produce.
4. **No overlapping requests.** Track the in-flight request and skip the tick
   rather than queueing; on a slow connection, queued polls stack up.

Back off on failure — 3s → 6s → 12s, capped at 30s, reset on success — and
surface a quiet "reconnecting" indicator rather than a toast per failed poll.
Use `AbortController` to cancel in flight on unmount.

### Reconciliation

The poll result **replaces** board state, except for the card currently open in
the dialog with unsaved edits, which is preserved. There is no merge algorithm
and there should not be: last write wins is the documented behaviour on the
build sheet, and both boards agree within one poll.

Where a poll arrives while an optimistic move is unacknowledged, the optimistic
state wins until the action resolves.

## Gotchas

- **`no-store`, and no `revalidate`.** Next will happily cache a route handler
  and serve a board frozen at build time.
- The interval must be cleared on unmount, on team switch, and on sign-out. A
  leaked interval polls an endpoint the user can no longer access and fills the
  console with 401s.
- Session expiry mid-poll should redirect to sign-in once, not loop.
- Do not poll `router.refresh()` instead — it re-fetches the whole RSC payload
  and flickers, and it makes the board's data path different from the initial
  render's.

## Acceptance criteria

- [ ] Two browser windows on the same board: a move in one appears in the other
      within ~5 seconds without interaction.
- [ ] Creating, editing and deleting a card also propagate.
- [ ] Dragging a card in window A is not disturbed by a poll landing mid-drag.
- [ ] Typing in a card dialog is not overwritten by a poll.
- [ ] Switching to another browser tab stops the polling; returning fetches once
      immediately.
- [ ] With no changes, the endpoint returns `204` and the client does no work.
- [ ] Stopping the server makes the poll back off rather than hammering, and it
      recovers when the server returns.
- [ ] The endpoint refuses a board in another organisation with `404`.
- [ ] Signing out stops the polling; no orphaned interval remains.
- [ ] Navigating away from the board clears the interval (verified in the
      Network panel).
- [ ] Two people moving the same card at once leaves both boards agreeing within
      one poll, with no duplicated or lost card.
