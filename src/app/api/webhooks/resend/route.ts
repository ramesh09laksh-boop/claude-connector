import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { markEmailByProviderId, type EmailStatus } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_STATUS: Record<string, EmailStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "sent",
};

/**
 * Turns `sent` into `delivered` or `bounced` on the system page's email log.
 *
 * The signature is verified against the RAW body: parsing as JSON and
 * re-serialising changes the bytes, and then every request fails verification
 * for reasons that look nothing like the cause.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  // No secret set is not an error — it is a feature that isn't switched on.
  if (!secret) {
    return NextResponse.json({ ignored: "not configured" }, { status: 202 });
  }

  const raw = await request.text();

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatureHeader = request.headers.get("svix-signature");

  if (!id || !timestamp || !signatureHeader) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!verify({ secret, id, timestamp, raw, signatureHeader })) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const status = payload.type ? EVENT_STATUS[payload.type] : undefined;
  const providerId = payload.data?.email_id;

  if (status && providerId) {
    await markEmailByProviderId(providerId, status);
  }

  return NextResponse.json({ ok: true });
}

function verify({
  secret,
  id,
  timestamp,
  raw,
  signatureHeader,
}: {
  secret: string;
  id: string;
  timestamp: string;
  raw: string;
  signatureHeader: string;
}) {
  // Svix secrets are prefixed and base64-encoded.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");

  // The header can carry several space-separated `v1,<sig>` pairs.
  return signatureHeader.split(" ").some((part) => {
    const [, candidate] = part.split(",");
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
