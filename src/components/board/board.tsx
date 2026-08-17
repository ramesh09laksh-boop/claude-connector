"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBoardPoll } from "@/hooks/use-board-poll";
import { createCard, deleteCard, moveCard, updateCard } from "@/lib/actions/cards";
import {
  createColumn,
  deleteColumn,
  renameColumn,
  reorderColumns,
} from "@/lib/actions/columns";
import type { BoardCard, BoardState } from "@/lib/boards";
import type { OrgRole } from "@/lib/permissions";

import { BoardCardView } from "./board-card";
import { BoardColumnView } from "./board-column";
import { CardDialog, type CardDialogMember } from "./card-dialog";

export function Board({
  initial,
  role,
  teamId,
  members,
}: {
  initial: BoardState;
  role: OrgRole;
  teamId: string;
  members: CardDialogMember[];
}) {
  const router = useRouter();
  const [state, setState] = useState<BoardState>(initial);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [dialogDirty, setDialogDirty] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Refs so the poll can read "is something in flight?" without re-subscribing.
  // Written in an effect rather than during render.
  const draggingRef = useRef(false);
  const dirtyRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    dirtyRef.current = dialogDirty;
  }, [dialogDirty]);

  // Members drag cards; only Owners and Admins shape the columns.
  const canManageColumns = role === "owner" || role === "admin";
  const canEditCards = true;

  const { reconnecting } = useBoardPoll({
    boardId: state.boardId,
    getVersion: () => stateRef.current.version,
    isBusy: () => draggingRef.current || dirtyRef.current,
    onState: (next) => setState(next),
    onSessionExpired: () => router.push("/sign-in"),
  });

  const sensors = useSensors(
    // Without an activation distance every card becomes impossible to click —
    // the single most common way a dnd-kit board ships broken.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // A short press delay on touch so a scroll gesture isn't read as a drag.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardsById = useMemo(() => {
    const map = new Map<string, BoardCard>();
    for (const column of state.columns) {
      for (const card of column.cards) map.set(card.id, card);
    }
    return map;
  }, [state]);

  const openCard = openCardId ? (cardsById.get(openCardId) ?? null) : null;

  const applyResult = useCallback(
    (result: { ok: true; data: BoardState | null } | { ok: false; error: string }) => {
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      if (result.data) setState(result.data);
      return true;
    },
    [],
  );

  function onDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    const card = cardsById.get(String(event.active.id));
    setActiveCard(card ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    setActiveCard(null);

    if (!over) return;

    const cardId = String(active.id);
    const card = cardsById.get(cardId);
    if (!card) return;

    // The snapshot is taken here rather than by recomputing the inverse move,
    // so a failed move restores exactly what was on screen.
    const snapshot = stateRef.current;

    const overId = String(over.id);
    let toColumnId: string;
    let toIndex: number;

    if (overId.startsWith("column:")) {
      toColumnId = overId.slice("column:".length);
      const target = snapshot.columns.find((c) => c.id === toColumnId);
      toIndex = target ? target.cards.length : 0;
    } else {
      const overCard = cardsById.get(overId);
      if (!overCard) return;
      toColumnId = overCard.columnId;
      const target = snapshot.columns.find((c) => c.id === toColumnId);
      toIndex = target ? target.cards.findIndex((c) => c.id === overId) : 0;
      if (toIndex < 0) toIndex = 0;
    }

    if (card.columnId === toColumnId) {
      const column = snapshot.columns.find((c) => c.id === toColumnId);
      const currentIndex = column?.cards.findIndex((c) => c.id === cardId) ?? -1;
      if (currentIndex === toIndex) return;
    }

    // Optimistic: move it locally first so the card lands where it was dropped.
    setState(moveCardLocally(snapshot, cardId, toColumnId, toIndex));

    const result = await moveCard({ cardId, toColumnId, toIndex });

    if (!result.ok) {
      setState(snapshot);
      toast.error(result.error);
      return;
    }
    if (result.data) setState(result.data);
  }

  async function onAddColumn(event: React.FormEvent) {
    event.preventDefault();
    const name = newColumnName.trim();
    if (!name) return;
    const result = await createColumn({ teamId, name });
    if (applyResult(result)) {
      setNewColumnName("");
      setAddingColumn(false);
    }
  }

  async function onMoveColumn(columnId: string, direction: -1 | 1) {
    const ids = state.columns.map((c) => c.id);
    const from = ids.indexOf(columnId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    applyResult(await reorderColumns({ teamId, orderedIds: ids }));
  }

  const hasColumns = state.columns.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {state.teamName}
          </h1>
          <p className="text-xs text-muted-foreground">{state.boardName}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {reconnecting ? (
            <span className="text-xs text-muted-foreground">Reconnecting…</span>
          ) : null}
          {canManageColumns ? (
            <>
              <Button
                render={<Link href={`/teams/${teamId}/members`} />}
                nativeButton={false}
                variant="ghost"
                size="sm"
              >
                Members
              </Button>
              {addingColumn ? null : (
                <Button size="sm" onClick={() => setAddingColumn(true)}>
                  Add column
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {addingColumn && canManageColumns ? (
        <form
          onSubmit={onAddColumn}
          className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3 sm:px-6"
        >
          <Input
            autoFocus
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="Column name"
            className="max-w-xs"
          />
          <Button type="submit" size="sm" disabled={!newColumnName.trim()}>
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAddingColumn(false);
              setNewColumnName("");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}

      {hasColumns ? (
        <DndContext
          // A stable id: without one, dnd-kit's generated `aria-describedby`
          // counter starts fresh on the client and every card hydrates with a
          // mismatch warning.
          id="lanes-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            draggingRef.current = false;
            setActiveCard(null);
          }}
        >
          {/* Columns scroll horizontally with snap points on a narrow
              viewport; each column then scrolls vertically on its own. */}
          <div className="min-h-0 flex-1 overflow-x-auto p-4 sm:p-6">
            <div className="flex h-full min-h-[28rem] snap-x snap-mandatory gap-4">
              {state.columns.map((column) => (
                <BoardColumnView
                  key={column.id}
                  column={column}
                  columns={state.columns}
                  canManageColumns={canManageColumns}
                  canEditCards={canEditCards}
                  onOpenCard={setOpenCardId}
                  onCreateCard={async (columnId, title) => {
                    applyResult(await createCard({ columnId, title }));
                  }}
                  onRenameColumn={async (columnId, name) => {
                    applyResult(await renameColumn({ columnId, name }));
                  }}
                  onDeleteColumn={async (columnId, moveCardsTo) => {
                    applyResult(await deleteColumn({ columnId, moveCardsTo }));
                  }}
                  onMoveColumn={onMoveColumn}
                />
              ))}
            </div>
          </div>

          {/* The lifted card follows the cursor; the one in the list shows a gap. */}
          <DragOverlay>
            {activeCard ? <BoardCardView card={activeCard} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-sm text-center">
            <h2 className="font-medium">This board has no columns yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {canManageColumns
                ? "Add your first column and the board is ready to use."
                : "An owner or admin needs to add a column before there's anywhere to put a card."}
            </p>
            {canManageColumns ? (
              <Button className="mt-4" onClick={() => setAddingColumn(true)}>
                Add your first column
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <CardDialog
        card={openCard}
        members={members}
        canEdit={canEditCards}
        open={openCardId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenCardId(null);
        }}
        onDirtyChange={setDialogDirty}
        onSave={async (input) => applyResult(await updateCard(input))}
        onDelete={async (cardId) => {
          if (applyResult(await deleteCard({ cardId }))) setOpenCardId(null);
        }}
      />
    </div>
  );
}

/** The optimistic half of a move — the server still decides what's true. */
function moveCardLocally(
  state: BoardState,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): BoardState {
  const columns = state.columns.map((column) => ({
    ...column,
    cards: column.cards.filter((c) => c.id !== cardId),
  }));

  const moving = state.columns
    .flatMap((c) => c.cards)
    .find((c) => c.id === cardId);

  if (!moving) return state;

  return {
    ...state,
    columns: columns.map((column) => {
      if (column.id !== toColumnId) return column;
      const next = [...column.cards];
      next.splice(Math.min(toIndex, next.length), 0, {
        ...moving,
        columnId: toColumnId,
      });
      return { ...column, cards: next.map((c, i) => ({ ...c, position: i })) };
    }),
  };
}
