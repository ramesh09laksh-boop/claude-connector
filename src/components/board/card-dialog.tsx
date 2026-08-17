"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BoardCard } from "@/lib/boards";

const UNASSIGNED = "__unassigned__";

export type CardDialogMember = { id: string; name: string; image: string | null };

export type CardDialogProps = {
  card: BoardCard | null;
  members: CardDialogMember[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: {
    cardId: string;
    title: string;
    description: string | null;
    assigneeId: string | null;
    dueDate: string | null;
  }) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<void>;
};

export function CardDialog({ card, ...rest }: CardDialogProps) {
  if (!card) return null;

  // Keyed on the card id so opening a different card remounts the form with
  // fresh initial state. That is what replaces an effect that copies props
  // into state — the effect version renders once with the previous card's
  // values before correcting itself.
  return <CardDialogForm key={card.id} card={card} {...rest} />;
}

function CardDialogForm({
  card,
  members,
  canEdit,
  open,
  onOpenChange,
  onDirtyChange,
  onSave,
  onDelete,
}: CardDialogProps & { card: BoardCard }) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [assigneeId, setAssigneeId] = useState(card.assignee?.id ?? UNASSIGNED);
  const [dueDate, setDueDate] = useState(
    card.dueDate ? card.dueDate.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty =
    title !== card.title ||
    description !== (card.description ?? "") ||
    assigneeId !== (card.assignee?.id ?? UNASSIGNED) ||
    dueDate !== (card.dueDate ? card.dueDate.slice(0, 10) : "");

  // The poll reads this: a background refresh must never overwrite a
  // half-typed description.
  useEffect(() => {
    onDirtyChange(open && dirty);
    return () => onDirtyChange(false);
  }, [open, dirty, onDirtyChange]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave({
      cardId: card.id,
      title: title.trim(),
      description: description.trim() ? description : null,
      assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
      // A date input gives a bare day; anchor it to midday so a timezone shift
      // can't move it onto the day before.
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{canEdit ? "Edit card" : card.title}</DialogTitle>
            <DialogDescription>
              {canEdit
                ? "Changes are visible to everyone on this team."
                : "You can read this card, but not change it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="card-title">Title</Label>
              <Input
                id="card-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-description">Description</Label>
              <Textarea
                id="card-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                rows={4}
                placeholder="What does done look like?"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="card-assignee">Assignee</Label>
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setAssigneeId(value ?? UNASSIGNED)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="card-assignee">
                    {/* Base UI renders the raw value unless it is formatted,
                        which would put "__unassigned__" on screen. */}
                    <SelectValue placeholder="Nobody yet">
                      {(value: string | null) =>
                        !value || value === UNASSIGNED
                          ? "Nobody yet"
                          : (members.find((m) => m.id === value)?.name ??
                            "Nobody yet")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
                    {/* Only people who can already see this board. */}
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-due">Due date</Label>
                <Input
                  id="card-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>

          {canEdit ? (
            <DialogFooter className="sm:justify-between">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sure?</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void onDelete(card.id)}
                  >
                    Delete card
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={saving || !title.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
