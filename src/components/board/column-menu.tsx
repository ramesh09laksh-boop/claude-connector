"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardColumnState } from "@/lib/boards";

export function ColumnMenu({
  column,
  columns,
  onRename,
  onDelete,
  onMove,
}: {
  column: BoardColumnState;
  columns: BoardColumnState[];
  onRename: (columnId: string, name: string) => Promise<void>;
  onDelete: (columnId: string, moveCardsTo: string | null) => Promise<void>;
  onMove: (columnId: string, direction: -1 | 1) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(column.name);
  const [destination, setDestination] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const others = columns.filter((c) => c.id !== column.id);
  const index = columns.findIndex((c) => c.id === column.id);
  const hasCards = column.cards.length > 0;

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    await onRename(column.id, trimmed);
    setBusy(false);
    setRenaming(false);
  }

  async function submitDelete() {
    setBusy(true);
    await onDelete(column.id, hasCards ? destination : null);
    setBusy(false);
    setDeleting(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              aria-label={`Options for ${column.name}`}
            />
          }
        >
          <span aria-hidden>⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setName(column.name);
              setRenaming(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index <= 0}
            onClick={() => void onMove(column.id, -1)}
          >
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === columns.length - 1}
            onClick={() => void onMove(column.id, 1)}
          >
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDestination(others[0]?.id ?? "");
              setDeleting(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>Rename column</DialogTitle>
              <DialogDescription>
                Everyone on this team sees the new name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor={`rename-${column.id}`}>Name</Label>
              <Input
                id={`rename-${column.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{column.name}”?</DialogTitle>
            <DialogDescription>
              {hasCards
                ? `This column holds ${column.cards.length} ${column.cards.length === 1 ? "card" : "cards"}. Choose where they go — Lanes won't delete them for you.`
                : "This column is empty, so nothing is lost."}
            </DialogDescription>
          </DialogHeader>

          {hasCards ? (
            <div className="space-y-2 py-2">
              <Label htmlFor={`move-${column.id}`}>Move the cards to</Label>
              {others.length > 0 ? (
                <Select
                  value={destination}
                  onValueChange={(value) => setDestination(value ?? "")}
                >
                  <SelectTrigger id={`move-${column.id}`}>
                    <SelectValue placeholder="Choose a column">
                      {(value: string | null) =>
                        others.find((c) => c.id === value)?.name ??
                        "Choose a column"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  There is nowhere else to put them. Add another column first.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDelete()}
              disabled={busy || (hasCards && !destination)}
            >
              {busy ? "Deleting…" : "Delete column"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
