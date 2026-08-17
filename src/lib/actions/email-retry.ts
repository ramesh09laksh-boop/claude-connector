"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { emailLog } from "@/lib/db/schema";
import { requireAdmin, NotFoundError } from "@/lib/auth-guards";
import { sendEmail, type EmailTemplate } from "@/lib/email";
import VerifyEmail from "@/emails/verify-email";
import ResetPassword from "@/emails/reset-password";
import ConfirmDelete from "@/emails/confirm-delete";
import { runAction, type ActionResult } from "./shared";

/**
 * Retry a failed send.
 *
 * It goes through the same `sendEmail` helper, so the retry is logged too.
 * Bodies are never stored, so this re-sends the template with a link back to
 * the app rather than reproducing the original message — enough to tell the
 * recipient something is waiting for them.
 */
export async function retryEmail(input: {
  emailLogId: string;
}): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    // Every action behind the system page re-checks on the server.
    await requireAdmin();

    const parsed = z.object({ emailLogId: z.string().uuid() }).parse(input);

    const [row] = await db
      .select({
        to: emailLog.to,
        subject: emailLog.subject,
        template: emailLog.template,
      })
      .from(emailLog)
      .where(eq(emailLog.id, parsed.emailLogId))
      .limit(1);

    if (!row) throw new NotFoundError("That email is no longer in the log.");

    const appUrl =
      process.env.APP_URL?.trim() ||
      process.env.BETTER_AUTH_URL?.trim() ||
      "http://localhost:3000";

    const result = await sendEmail({
      to: row.to,
      subject: row.subject,
      template: row.template as EmailTemplate,
      react: templateFor(row.template as EmailTemplate, appUrl),
    });

    revalidatePath("/settings/system");
    return { status: result.status };
  });
}

function templateFor(template: EmailTemplate, url: string) {
  switch (template) {
    case "reset-password":
      return ResetPassword({ url: `${url}/forgot-password` });
    case "confirm-delete":
      return ConfirmDelete({ url: `${url}/settings/account` });
    case "verify-email":
    default:
      return VerifyEmail({ url: `${url}/settings/account` });
  }
}
