"use server";

import { sessionActor } from "@/lib/actor";
import type { BoardState } from "@/lib/boards";
import {
  createCardFor,
  deleteCardFor,
  moveCardFor,
  updateCardFor,
} from "@/lib/services/cards";
import { runAction, type ActionResult } from "./shared";

/**
 * The browser's way in. The work — validation, the guard chain, the ordering
 * rules — is in `lib/services/cards.ts`, because the MCP tools at `/mcp` run the
 * same operations for the same user and must not get a second implementation of
 * them.
 *
 * All these do is name the actor. That is deliberate and load-bearing: every
 * export of a `"use server"` file is a public HTTP endpoint, so an action that
 * accepted an actor as an argument would let its caller choose whose account to
 * act as. The actor is resolved here, from the session, and never passed in.
 */

export async function createCard(input: {
  columnId: string;
  title: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => createCardFor(await sessionActor(), input));
}

export async function updateCard(input: {
  cardId: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => updateCardFor(await sessionActor(), input));
}

export async function deleteCard(input: {
  cardId: string;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => deleteCardFor(await sessionActor(), input));
}

export async function moveCard(input: {
  cardId: string;
  toColumnId: string;
  toIndex: number;
}): Promise<ActionResult<BoardState | null>> {
  return runAction(async () => moveCardFor(await sessionActor(), input));
}
