import { NextResponse } from "next/server";

import { getBoardState, getBoardStateVersion } from "@/lib/boards";
import { sessionActor } from "@/lib/actor";
import { NotFoundError, requireBoardAccess } from "@/lib/board-guards";
import { UnauthenticatedError } from "@/lib/auth-guards";

export const runtime = "nodejs";
// A cached board is a stale board, and Next will happily cache a route handler.
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/boards/[boardId]/state">,
) {
  const { boardId } = await ctx.params;

  try {
    const access = await requireBoardAccess(await sessionActor(), boardId);
    const clientVersion = new URL(request.url).searchParams.get("v");
    const version = await getBoardStateVersion(access.team.id);

    // Most polls change nothing. Answering those with a 204 makes the steady
    // state a timestamp comparison rather than a full board serialisation.
    if (clientVersion && clientVersion === version) {
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const state = await getBoardState(access.team.id);
    if (!state) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (cause instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    // 404, never 403 — a 403 confirms the board exists.
    if (cause instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[board state]", cause);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
