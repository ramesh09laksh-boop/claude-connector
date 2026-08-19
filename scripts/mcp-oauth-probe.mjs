/**
 * End-to-end probe of the /mcp connector: DCR → PKCE authorize → sign-in →
 * consent → token → JSON-RPC.
 *
 * This is the flow Claude performs when a user adds the connector, driven from
 * the terminal so it can be run without a browser. Not part of the app; a
 * development tool.
 *
 *   node scripts/mcp-oauth-probe.mjs [email] [password]
 */

import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.LANES_URL ?? "http://localhost:3000";
const EMAIL = process.argv[2] ?? "ada@lanes.test";
const PASSWORD = process.argv[3] ?? "lanes-owner-passphrase";
const REDIRECT_URI = "http://localhost:9876/callback";

const b64url = (buf) => buf.toString("base64url");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());

/** Better Auth sets several cookies; keep them all across the flow. */
const jar = new Map();
function absorb(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
const cookieHeader = () =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function step(label, fn) {
  process.stdout.write(`\n── ${label}\n`);
  const result = await fn();
  return result;
}

// 1. Dynamic client registration -------------------------------------------
const client = await step("register (DCR)", async () => {
  const res = await fetch(`${BASE}/api/auth/mcp/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "MCP OAuth Probe",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  const json = await res.json();
  console.log(`   client_id: ${json.client_id}`);
  return json;
});

// 2. Sign in, to get the session the authorize endpoint needs ---------------
await step(`sign in as ${EMAIL}`, async () => {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    // Better Auth's CSRF check requires an Origin on browser-shaped requests;
    // a real sign-in form always sends one.
    headers: { "Content-Type": "application/json", origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  absorb(res);
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  console.log(`   ok, ${jar.size} cookie(s)`);
});

// 3. Authorize with PKCE ----------------------------------------------------
const consentCode = await step("authorize (PKCE S256)", async () => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email offline_access",
    state: "probe-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = await fetch(`${BASE}/api/auth/mcp/authorize?${params}`, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  absorb(res);

  const location = res.headers.get("location");
  console.log(`   ${res.status} → ${location}`);
  if (!location) throw new Error(`no redirect: ${await res.text()}`);

  const url = new URL(location, BASE);
  // Either straight back to the client (consent already given) or to /oauth/consent.
  if (url.searchParams.has("code")) return { alreadyConsented: url };
  const code = url.searchParams.get("consent_code");
  if (!code) throw new Error(`unexpected redirect: ${location}`);
  console.log(`   consent page: ${url.pathname}`);
  return { consentCode: code };
});

// 4. Consent ----------------------------------------------------------------
const authCodeUrl = await step("consent", async () => {
  if (consentCode.alreadyConsented) {
    console.log("   already consented, skipped");
    return consentCode.alreadyConsented;
  }
  const res = await fetch(`${BASE}/api/auth/oauth2/consent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader(),
      origin: BASE,
    },
    body: JSON.stringify({ accept: true, consent_code: consentCode.consentCode }),
  });
  absorb(res);
  const json = await res.json();
  if (!json.redirectURI) throw new Error(`no redirectURI: ${JSON.stringify(json)}`);
  console.log(`   → ${json.redirectURI}`);
  return new URL(json.redirectURI);
});

const authorizationCode = authCodeUrl.searchParams.get("code");
if (!authorizationCode) throw new Error("no authorization code in redirect");

// 5. Token exchange ---------------------------------------------------------
const tokens = await step("token exchange", async () => {
  const res = await fetch(`${BASE}/api/auth/mcp/token`, {
    method: "POST",
    // RFC 6749: the token endpoint takes form encoding, not JSON.
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: verifier,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`no access_token: ${JSON.stringify(json)}`);
  console.log(
    `   access_token ok (expires_in ${json.expires_in}, refresh ${json.refresh_token ? "yes" : "no"})`,
  );
  return json;
});

// 6. Speak MCP --------------------------------------------------------------
let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokens.access_token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  // The transport answers with SSE unless the client insists otherwise; pull the
  // JSON payload out of the last data: frame.
  const frame = text.includes("data:")
    ? text.split("data:").pop().trim()
    : text.trim();
  if (!res.ok) throw new Error(`${method} → ${res.status} ${text}`);
  return JSON.parse(frame);
}

await step("initialize", async () => {
  const out = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-oauth-probe", version: "1.0.0" },
  });
  console.log(`   server: ${out.result?.serverInfo?.name} ${out.result?.serverInfo?.version}`);
});

const tools = await step("tools/list", async () => {
  const out = await rpc("tools/list", {});
  const list = out.result?.tools ?? [];
  for (const t of list) {
    const a = t.annotations ?? {};
    const kind = a.readOnlyHint ? "read" : a.destructiveHint ? "DESTRUCTIVE" : "write";
    console.log(`   ${t.name.padEnd(26)} ${kind}`);
  }
  console.log(`   ${list.length} tools`);
  return list;
});

export { tools };

// 7. Exercise a read --------------------------------------------------------
await step("call lanes_list_teams", async () => {
  const out = await rpc("tools/call", { name: "lanes_list_teams", arguments: {} });
  console.log(
    out.result?.content?.[0]?.text ?? JSON.stringify(out).slice(0, 400),
  );
});

console.log("\n✓ full OAuth + MCP round-trip succeeded");
console.log(`\nACCESS_TOKEN=${tokens.access_token}`);
