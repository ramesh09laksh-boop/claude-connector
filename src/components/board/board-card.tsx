"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { BoardCard as BoardCardType } from "@/lib/boards";

import { dueDateLabel } from "./due-date";

export function BoardCardView({
  card,
  dragging,
}: {
  card: BoardCardType;
  dragging?: boolean;
}) {
  const due = dueDateLabel(card.dueDate);
  const initials = card.assignee?.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3 text-left shadow-sm transition-shadow",
        dragging && "shadow-lg ring-2 ring-primary",
      )}
    >
      <p className="text-sm font-medium">{card.title}</p>

      {due || card.assignee ? (
        <div className="mt-2.5 flex items-center gap-2">
          {due ? (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                due.tone === "overdue" &&
                  "bg-destructive/10 text-destructive dark:bg-destructive/20",
                due.tone === "today" &&
                  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                due.tone === "neutral" && "bg-muted text-muted-foreground",
              )}
            >
              {/* The word carries the meaning, not the colour alone. */}
              {due.label}
            </span>
          ) : null}
          {card.assignee ? (
            <Avatar className="ml-auto size-6" title={card.assignee.name}>
              {card.assignee.image ? (
                <AvatarImage src={card.assignee.image} alt="" />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SortableBoardCard({
  card,
  onOpen,
}: {
  card: BoardCardType;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: "card", columnId: card.columnId } });

  return (
    // dnd-kit's `attributes` already put role="button" and tabIndex here, so
    // the title inside must not be a <button> of its own — a button inside a
    // button is invalid HTML and traps the keyboard.
    //
    // Space lifts the card for dragging (dnd-kit owns that key); Enter opens
    // it. A plain click opens it too, which the 8px pointer activation
    // distance keeps distinct from the start of a drag.
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("cursor-grab outline-none", isDragging && "opacity-40")}
      aria-label={`${card.title} — press Enter to open, Space to pick up`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      // Composed rather than replaced: spreading `listeners` installs
      // dnd-kit's own key handler, and setting onKeyDown before the spread
      // would silently lose this one. Space still belongs to dnd-kit.
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
    >
      <BoardCardView card={card} />
    </div>
  );
}
