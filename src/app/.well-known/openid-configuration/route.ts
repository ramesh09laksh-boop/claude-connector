import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * The OpenID Connect Discovery spelling of the same document.
 *
 * Claude reads RFC 8414 metadata, but the MCP authorization spec allows a client
 * to look for either, and some tooling — the MCP Inspector among it — tries this
 * path first. Serving both costs one file and removes a class of "works in
 * Claude, fails in the inspector" confusion.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = oAuthDiscoveryMetadata(auth);
