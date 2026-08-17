"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BoardColumnState } from "@/lib/boards";

import { SortableBoardCard } from "./board-card";
import { ColumnMenu } from "./column-menu";

export function BoardColumnView({
  column,
  columns,
  canManageColumns,
  canEditCards,
  onOpenCard,
  onCreateCard,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
}: {
  column: BoardColumnState;
  columns: BoardColumnState[];
  canManageColumns: boolean;
  canEditCards: boolean;
  onOpenCard: (cardId: string) => void;
  onCreateCard: (columnId: string, title: string) => Promise<void>;
  onRenameColumn: (columnId: string, name: string) => Promise<void>;
  onDeleteColumn: (columnId: string, moveCardsTo: string | null) => Promise<void>;
  onMoveColumn: (columnId: string, direction: -1 | 1) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitCard(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    await onCreateCard(column.id, trimmed);
    setSaving(false);
    setTitle("");
  }

  return (
    <section
      className="flex h-full w-72 shrink-0 snap-start flex-col rounded-lg border bg-muted/40"
      aria-label={column.name}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <h2 className="truncate text-sm font-medium">{column.name}</h2>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {column.cards.length}
        </span>
        {canManageColumns ? (
          <div className="ml-auto">
            <ColumnMenu
              column={column}
              columns={columns}
              onRename={onRenameColumn}
              onDelete={onDeleteColumn}
              onMove={onMoveColumn}
            />
          </div>
        ) : null}
      </header>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto p-2 ${isOver ? "bg-accent/50" : ""}`}
      >
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <SortableBoardCard
              key={card.id}
              card={card}
              onOpen={() => onOpenCard(card.id)}
            />
          ))}
        </SortableContext>

        {column.cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Nothing in this lane yet
          </p>
        ) : null}
      </div>

      {canEditCards ? (
        <div className="border-t p-2">
          {composing ? (
            <form onSubmit={submitCard} className="space-y-2">
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs doing?"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setComposing(false);
                    setTitle("");
                  }
                }}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving || !title.trim()}>
                  {saving ? "Adding…" : "Add card"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setComposing(false);
                    setTitle("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setComposing(true)}
            >
              + Add a card
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
