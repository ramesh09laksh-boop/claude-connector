import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * `/.well-known/oauth-protected-resource/mcp`.
 *
 * When a client has to guess where the protected resource metadata lives, it
 * appends the resource's *path* to the well-known prefix — so a server mounted
 * at `/mcp` is described here. This is the first location Claude probes, before
 * falling back to `/.well-known/oauth-protected-resource`.
 *
 * Same document as the sibling route; the path is the whole point.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = oAuthProtectedResourceMetadata(auth);
