import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { siteUrlConfigured } from "@/lib/site";

/**
 * Never render a secret, or part of one.
 *
 * This reports whether something is *configured*, never what it is configured
 * with. No keys, no connection strings, no `re_…abc4` tails, not in a tooltip
 * and not behind a copy button — a masked key is a key with fewer characters
 * left to guess, and this page exists to be looked at.
 */
export type SystemCheck = {
  name: string;
  ok: boolean;
  /** The NAME of the variable to set. Never its value. */
  hint: string;
  detail?: string;
};

export async function getSystemChecks(): Promise<SystemCheck[]> {
  return [
    await checkDatabase(),
    {
      name: "Email (Resend)",
      ok: Boolean(process.env.RESEND_API_KEY?.trim()),
      hint: "RESEND_API_KEY",
      detail:
        "Without it, every message prints to the server terminal and is logged below.",
    },
    {
      name: "Email delivery status",
      ok: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      hint: "RESEND_WEBHOOK_SECRET",
      detail:
        "Turns 'sent' into 'delivered' or 'bounced' in the email log.",
    },
    {
      // Gates no feature, which is exactly why it earns a row: without it the
      // sitemap and every canonical link quietly point at localhost in
      // production, and nobody notices until a search engine has read them.
      name: "Canonical URL",
      // Not `Boolean(APP_URL)`: a value that is set but unparseable falls back
      // to localhost just the same, and this row exists to catch exactly that.
      ok: siteUrlConfigured,
      hint: "APP_URL — the app's public address",
      detail: "Used by the sitemap, canonical links and invite links.",
    },
  ];
}

async function checkDatabase(): Promise<SystemCheck> {
  try {
    await db.execute(sql`select 1`);
    return { name: "Database", ok: true, hint: "POSTGRES_URL" };
  } catch {
    return {
      name: "Database",
      ok: false,
      hint: "POSTGRES_URL",
      detail: "Couldn't reach Postgres. Is `npm run db:up` running?",
    };
  }
}
