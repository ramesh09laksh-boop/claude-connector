import { render, toPlainText } from "react-email";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";

import { db } from "@/lib/db";
import { emailLog } from "@/lib/db/schema";

/**
 * The only file in the project that talks to Resend.
 *
 * It switches on the *presence of the key*, not on NODE_ENV or a mode flag, so
 * there is nothing to remember at deploy time. With no key the message and its
 * link print to the terminal and the app still works end to end.
 */
const apiKey = process.env.RESEND_API_KEY?.trim();

export const emailConfigured = Boolean(apiKey);

const resend = apiKey ? new Resend(apiKey) : null;

const from = process.env.EMAIL_FROM?.trim() || "Lanes <onboarding@resend.dev>";

export type EmailTemplate =
  | "verify-email"
  | "reset-password"
  | "confirm-delete";

export type EmailStatus =
  | "pending"
  | "logged"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed";

type SendEmailArgs = {
  to: string;
  subject: string;
  template: EmailTemplate;
  react: ReactElement;
};

export type SendEmailResult = {
  id: string;
  status: EmailStatus;
  error?: string;
};

/**
 * Nothing sends until it is logged. The `email_log` row goes in as `pending`
 * first — it is what the system page renders, what answers "why didn't my
 * email arrive?", and what outlives Resend's own retention.
 */
export async function sendEmail({
  to,
  subject,
  template,
  react,
}: SendEmailArgs): Promise<SendEmailResult> {
  const [row] = await db
    .insert(emailLog)
    .values({ to, subject, template, status: "pending" })
    .returning({ id: emailLog.id });

  const html = await render(react);
  const text = toPlainText(html);

  if (!resend) {
    // An empty RESEND_API_KEY *is* local development mode.
    console.info(
      [
        "",
        "──────── Lanes email (not sent — RESEND_API_KEY is empty) ────────",
        `To:       ${to}`,
        `Subject:  ${subject}`,
        `Template: ${template}`,
        "",
        text.trim(),
        "──────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    await markEmail(row.id, "logged");
    return { id: row.id, status: "logged" };
  }

  try {
    // `idempotencyKey` is the SECOND argument. Put it in the payload and it is
    // ignored, and a retry sends the message twice.
    const { data, error } = await resend.emails.send(
      { from, to, subject, html, text },
      { idempotencyKey: `${template}/${row.id}` },
    );

    // resend.emails.send does not throw on an API error — it returns
    // { data, error }. A bare try/catch swallows every rejected send.
    if (error) {
      await markEmail(row.id, "failed", { error: error.message });
      return { id: row.id, status: "failed", error: error.message };
    }

    await markEmail(row.id, "sent", { providerId: data?.id });
    return { id: row.id, status: "sent" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await markEmail(row.id, "failed", { error: message });
    return { id: row.id, status: "failed", error: message };
  }
}

async function markEmail(
  id: string,
  status: EmailStatus,
  extra: { providerId?: string | null; error?: string } = {},
) {
  await db
    .update(emailLog)
    .set({
      status,
      providerId: extra.providerId ?? null,
      error: extra.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(emailLog.id, id));
}

/** Used by the Resend webhook to move `sent` on to `delivered` / `bounced`. */
export async function markEmailByProviderId(
  providerId: string,
  status: EmailStatus,
) {
  await db
    .update(emailLog)
    .set({ status, updatedAt: new Date() })
    .where(eq(emailLog.providerId, providerId));
}
