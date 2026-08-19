import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * RFC 8414 authorization server metadata, at the origin root.
 *
 * Better Auth already serves this under its own base path
 * (`/api/auth/.well-known/…`), so why here as well? Because the protected
 * resource document advertises `authorization_servers: [origin]` — the bare
 * origin, with no base path. A client that reads it, as Claude does, then looks
 * for this document at the root of that origin. Without this file it gets a 404,
 * never discovers the token or registration endpoints, and the connection fails
 * with nothing more useful than "couldn't reach the MCP server".
 *
 * This is where `registration_endpoint` and `code_challenge_methods_supported:
 * ["S256"]` are published, which is what makes dynamic client registration and
 * PKCE discoverable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = oAuthDiscoveryMetadata(auth);
