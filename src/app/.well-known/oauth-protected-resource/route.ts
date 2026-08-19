import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * RFC 9728 protected resource metadata — the document that says "this resource
 * is `<origin>/mcp`, and the authorization server for it is over there".
 *
 * Its `resource` field must equal the URL the user types into Claude exactly,
 * which is why `auth.ts` sets the `mcp` plugin's `resource` option rather than
 * accepting the default (the bare origin).
 *
 * Claude finds this via the `resource_metadata` parameter on the 401 from
 * `/mcp`; this root copy is the documented fallback for clients that probe
 * instead, and the sibling `/mcp` route is the path they probe first.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = oAuthProtectedResourceMetadata(auth);
