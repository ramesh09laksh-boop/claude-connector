"use server";

import { sessionActor } from "@/lib/actor";
import type { BoardState } from "@/lib/boards";
import {
  createColumnFor,
  deleteColumnFor,
  renameColumnFor,
  reorderColumnsFor,
} from "@/lib/services/columns";
import { runAction, type ActionResult } from "./shared";

/** Session-actor wrappers over `lib/services/columns.ts` — see `cards.ts`. */

export async function createColumn(input: {
  teamId: string;
  name: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => createColumnFor(await sessionActor(), input));
}

export async function renameColumn(input: {
  columnId: string;
  name: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => renameColumnFor(await sessionActor(), input));
}

export async function deleteColumn(input: {
  columnId: string;
  moveCardsTo?: string | null;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => deleteColumnFor(await sessionActor(), input));
}

export async function reorderColumns(input: {
  teamId: string;
  orderedIds: string[];
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => reorderColumnsFor(await sessionActor(), input));
}
