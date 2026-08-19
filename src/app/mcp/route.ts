import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withMcpAuth } from "better-auth/plugins";

import { auth } from "@/lib/auth";
import { mcpActor } from "@/lib/actor";
import { createLanesMcpServer } from "@/lib/mcp/server";

/**
 * The remote MCP server: `[domain]/mcp`.
 *
 * Streamable HTTP, stateless. `WebStandardStreamableHTTPServerTransport` is the
 * Fetch-API transport, so it takes the `Request` a route handler is given and
 * returns a `Response` — no Node req/res shim, and nothing to adapt.
 *
 * Stateless is a deliberate choice, not a shortcut: constructed without a
 * `sessionIdGenerator` the transport keeps no in-memory state between requests,
 * so any instance can serve any request. A stateful server would pin a
 * conversation to whichever process happened to answer `initialize`.
 *
 * `withMcpAuth` is the boundary. It resolves the OAuth access token and, when
 * there isn't a valid one, answers 401 with the
 * `WWW-Authenticate: Bearer resource_metadata="…"` header that tells Claude
 * where to start the OAuth flow. That 401 is required — Claude ignores a
 * `WWW-Authenticate` header on a 200, and the connector simply never connects.
 */

export const runtime = "nodejs";
// A cached MCP response is somebody else's board.
export const dynamic = "force-dynamic";

/** Claude.ai calls this from the browser, so preflight has to be answerable. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID",
  // Without exposing these the browser hides them from the client, and the
  // 401 handshake that bootstraps OAuth becomes invisible.
  "Access-Control-Expose-Headers":
    "WWW-Authenticate, mcp-session-id, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
} as const;

const handler = withMcpAuth(auth, async (request, token) => {
  // One actor, one server, one transport per request — nothing is shared
  // between two users' requests because nothing outlives one.
  const actor = await mcpActor(token);
  const server = createLanesMcpServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport();

  await server.connect(transport);

  const response = await transport.handleRequest(request);

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export const GET = handler;
export const POST = handler;
export const DELETE = handler;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
