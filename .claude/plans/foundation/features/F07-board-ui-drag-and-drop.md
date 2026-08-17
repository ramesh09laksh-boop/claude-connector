# F07 — Board UI & drag and drop

**Depends on:** F06 · **Blocks:** F08, F10

## Purpose

The screen the app exists for. Columns side by side, cards inside them, dragged
by pointer or keyboard, with a dialog for editing a card's detail.

## Technical detail

### Library

`@dnd-kit` — core, sortable, modifiers.

Chosen over the alternatives for one reason above the others: **it ships
keyboard dragging out of the box** (space to lift, arrows to move, space to
drop, escape to cancel) with customisable screen-reader announcements.
Atlassian's Pragmatic drag-and-drop is faster past ~500 cards per board and
makes you implement keyboard support and collision detection yourself.
`react-beautiful-dnd` is deprecated and not a candidate.

Confirm React 19 peer-dependency support in the Phase 0 currency check before
installing — this is the one package in the stack where that has been a moving
target.

### Structure

```
src/app/(dashboard)/teams/[teamId]/page.tsx     server component
src/components/board/board.tsx                  client, owns state
src/components/board/board-column.tsx           client, a droppable column
src/components/board/board-card.tsx             client, a draggable card
src/components/board/card-dialog.tsx            client, view/edit one card
src/components/board/column-menu.tsx            client, rename/delete/reorder
```

The page is a **server component**: `requireTeamAccess(teamId)`, then
`getBoardState(teamId)`, then `<Board initial={state} role={role} />`. The
client component owns board state from there, because optimistic dragging needs
it to.

`export const dynamic = "force-dynamic"` — this page renders one team's data and
must never be prerendered. F15 checks the build's route table for exactly this.

### Sensors

- `PointerSensor` with `activationConstraint: { distance: 8 }` so a click to
  open a card is not read as a drag. Without it, every card becomes impossible
  to open on a trackpad.
- `KeyboardSensor` with `sortableKeyboardCoordinates`.
- `DragOverlay` renders the lifted card following the cursor, so the card in the
  list can show a placeholder gap.

Collision detection: `closestCorners` — it behaves better than `closestCenter`
for tall column targets.

### Optimistic move

1. `onDragEnd` computes the new local state and sets it immediately.
2. Call `moveCard({ cardId, toColumnId, toIndex })`.
3. On success, reconcile with what the action returns.
4. On failure, **revert to the pre-drag snapshot** and show a toast naming the
   reason — "You don't have permission to move cards" reads very differently
   from a card that silently springs back.

Take the snapshot in `onDragStart`, not by recomputing the inverse move.

### Card

Front: title, assignee avatar, due-date badge. The badge is neutral normally,
amber today, red overdue — and carries a text label, not colour alone.

Dialog: title, description (textarea), assignee (select, **members of this team
only**), due date (date picker), Save, and Delete behind a confirm. Members of
the team who can't edit see it read-only rather than a dialog that saves
nothing.

### Columns

Horizontally scrollable row, each column a fixed width with its own vertical
scroll. Header shows the name, the card count, and — for Owner/Admin only — a
menu with rename, delete and reorder. "Add a card" sits at the bottom of each
column as an inline composer, not a modal.

### Permissions in the UI

Controls a role cannot use are **not rendered**. This is presentation; F06's
server actions are the boundary. Both are required — a hidden control that the
server would accept is a hole, and a visible control that the server refuses is
a dead button.

### Empty states

- Board with no cards: "Nothing in this lane yet" per column, and a prompt on
  the first column.
- Team with no columns (all deleted): an "add your first column" state for
  Admins, and an explanatory one for Members.
- These read as a beginning, not as breakage. This is the difference between a
  working app and a broken-looking one on day one.

### Responsive

Columns scroll horizontally on a narrow viewport with snap points. Pointer
dragging works on touch via `TouchSensor` or a pointer-events-based sensor with
a short press delay so a scroll gesture isn't captured as a drag.

## Gotchas

- **Without an activation distance, cards cannot be clicked.** This is the
  single most common way a `@dnd-kit` board ships broken.
- A `DragOverlay` card must not also render in the list, or the item appears
  twice mid-drag.
- Stable `id`s on sortable items — using the array index makes cards swap
  identity on reorder.
- Auto-scrolling the column container during a drag near its edge is needed for
  any column taller than the viewport.
- Do not put the card dialog inside the draggable — a dialog nested in a drag
  context traps focus in ways that break keyboard dragging.

## Acceptance criteria

- [ ] The board renders columns in order with their cards in order.
- [ ] Dragging a card to another column moves it, and the change survives a
      reload.
- [ ] Dragging a card within a column reorders it, and that survives a reload.
- [ ] **Keyboard dragging works**: tab to a card, space to lift, arrows to move,
      space to drop, escape to cancel.
- [ ] A single click on a card opens its dialog rather than starting a drag.
- [ ] A failed move reverts the card to its original position and shows a toast
      naming the reason.
- [ ] Creating, editing and deleting a card all work through the UI.
- [ ] The assignee select lists only members of this team.
- [ ] The due-date badge distinguishes overdue by more than colour.
- [ ] A Member sees no column menu and no "add column" control.
- [ ] Every control rendered for a role is one the server will actually accept —
      no dead buttons.
- [ ] Empty board, empty column and no-columns states all read as intentional.
- [ ] The board is usable at a phone-width viewport, and in dark mode.
- [ ] `npm run build` shows the team board route as `ƒ`, not `○`.
