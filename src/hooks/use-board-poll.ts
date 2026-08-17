"use client";

import { useEffect, useRef, useState } from "react";

import type { BoardState } from "@/lib/boards";

const BASE_INTERVAL_MS = 3000;
const MAX_INTERVAL_MS = 30000;

export type BoardPollOptions = {
  boardId: string;
  /** Whatever the board is showing right now — used for the ?v= short-circuit. */
  getVersion: () => string;
  /** True while a drag or an unsaved dialog edit is in flight. */
  isBusy: () => boolean;
  onState: (state: BoardState) => void;
  /** Called once when the session has gone — never in a loop. */
  onSessionExpired: () => void;
};

/**
 * Poll the board every 3 seconds, with four rules that are each a real bug if
 * left out:
 *
 * 1. Skip while a drag is in flight, or a poll yanks the board out from under
 *    the cursor.
 * 2. Skip while the tab is hidden, and fetch once on becoming visible again —
 *    otherwise every background tab polls forever.
 * 3. Skip while a card dialog has unsaved edits. Overwriting someone's
 *    half-typed description is the worst thing this feature can do.
 * 4. No overlapping requests. On a slow connection queued polls stack up.
 */
export function useBoardPoll({
  boardId,
  getVersion,
  isBusy,
  onState,
  onSessionExpired,
}: BoardPollOptions) {
  const [reconnecting, setReconnecting] = useState(false);

  // Held in refs so changing them never restarts the interval. Written in an
  // effect rather than during render — a ref mutated mid-render is a value
  // React may or may not have committed yet.
  const getVersionRef = useRef(getVersion);
  const isBusyRef = useRef(isBusy);
  const onStateRef = useRef(onState);
  const onExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    getVersionRef.current = getVersion;
    isBusyRef.current = isBusy;
    onStateRef.current = onState;
    onExpiredRef.current = onSessionExpired;
  }, [getVersion, isBusy, onState, onSessionExpired]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;
    let delay = BASE_INTERVAL_MS;

    async function tick() {
      if (cancelled) return;

      if (document.visibilityState === "hidden" || isBusyRef.current() || inFlight) {
        schedule(BASE_INTERVAL_MS);
        return;
      }

      const controller = new AbortController();
      inFlight = controller;

      try {
        const version = encodeURIComponent(getVersionRef.current());
        const response = await fetch(
          `/api/boards/${boardId}/state?v=${version}`,
          { signal: controller.signal, cache: "no-store" },
        );

        if (cancelled) return;

        if (response.status === 401) {
          // Session expired. Send them to sign in once — never in a loop.
          cancelled = true;
          onExpiredRef.current();
          return;
        }

        if (response.status === 204) {
          delay = BASE_INTERVAL_MS;
          setReconnecting(false);
          schedule(delay);
          return;
        }

        if (!response.ok) throw new Error(`Board poll failed: ${response.status}`);

        const state = (await response.json()) as BoardState;

        // A poll that lands while the user started dragging is dropped rather
        // than applied — checking again here closes the gap between the
        // request going out and the response coming back.
        if (!isBusyRef.current()) onStateRef.current(state);

        delay = BASE_INTERVAL_MS;
        setReconnecting(false);
        schedule(delay);
      } catch (cause) {
        if (cancelled || (cause instanceof Error && cause.name === "AbortError")) {
          return;
        }
        // Back off rather than hammering a server that is down, and show a
        // quiet indicator instead of a toast per failed poll.
        delay = Math.min(delay * 2, MAX_INTERVAL_MS);
        setReconnecting(true);
        schedule(delay);
      } finally {
        inFlight = null;
      }
    }

    function schedule(ms: number) {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelled) {
        schedule(0);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(BASE_INTERVAL_MS);

    return () => {
      // Cleared on unmount, on team switch and on sign-out. A leaked interval
      // polls an endpoint the user can no longer reach and fills the console
      // with 401s.
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (inFlight) inFlight.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [boardId]);

  return { reconnecting };
}
