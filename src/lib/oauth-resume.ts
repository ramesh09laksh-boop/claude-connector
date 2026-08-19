/**
 * Resuming an interrupted OAuth authorisation after sign-in or sign-up.
 *
 * Someone connecting Lanes to Claude while signed out is sent from
 * `/api/auth/mcp/authorize` to `/sign-in`, carrying the whole authorize query
 * with them — `/sign-in?response_type=code&client_id=…`. Once they have a
 * session, that authorisation still needs finishing, and the sign-in page is
 * the only thing that knows it was ever started.
 *
 * Better Auth's `mcp` plugin does have a hook that resumes the flow, but it
 * answers with a 302. The auth client signs in over `fetch`, which follows
 * redirects transparently, so the form sees an ordinary success and the
 * destination is lost — the user lands on the dashboard and Claude is left
 * waiting on a callback that never comes. Rather than trying to recover a URL
 * the client already swallowed, the page reconstructs it: it has the query.
 *
 * Re-entering `/api/auth/mcp/authorize` with a session is all it takes; the
 * endpoint issues a fresh consent code and carries on. The abandoned code from
 * the hook's own attempt is never exchanged and expires on its own.
 */

const AUTHORIZE_PATH = "/api/auth/mcp/authorize";

/**
 * The page's own query, re-encoded. Next hands back an array for a repeated
 * parameter, and dropping the duplicates would quietly change the request.
 */
export function carryQuery(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      query.append(key, one);
    }
  }
  return query.toString();
}

/**
 * The URL to send someone to after signing in, or null for an ordinary sign-in.
 *
 * Note what this deliberately cannot do: the destination is always our own
 * authorize endpoint, built from this app's own path with the query copied
 * across. A crafted `/sign-in?client_id=…&redirect_uri=https://evil.example`
 * gets no further than starting an authorisation, and Better Auth refuses a
 * `redirect_uri` the client did not register. So unlike the `?redirect=`
 * parameter that `safeRedirect` exists to tame, this one never becomes an open
 * redirect, and does not need the same treatment.
 */
export function oauthResumeUrl(
  params: Record<string, string | string[] | undefined>,
): string | null {
  // The two parameters that make this an authorization request rather than
  // somebody arriving at /sign-in with stray query junk.
  if (!params.client_id || !params.response_type) return null;
  return `${AUTHORIZE_PATH}?${carryQuery(params)}`;
}
