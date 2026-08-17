import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/auth-schema";
import { ac, roles } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { seedBoardForTeam } from "@/lib/board-seed";
import { assertUserCanBeDeleted, cleanUpDeletedUser } from "@/lib/account-deletion";
import VerifyEmail from "@/emails/verify-email";
import ResetPassword from "@/emails/reset-password";
import ConfirmDelete from "@/emails/confirm-delete";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      // `void`, not `await`: awaiting makes the response measurably slower when
      // the account exists than when it doesn't, which tells an attacker who
      // has an account. Fire it and return.
      void sendEmail({
        to: user.email,
        subject: "Reset your Lanes password",
        template: "reset-password",
        react: ResetPassword({ name: user.name, url }),
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Deliberately no `requireEmailVerification`: blocking sign-in on
    // verification turns one mistyped address into a support request the user
    // cannot answer. The nag banner in the dashboard prompts instead.
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Confirm your email for Lanes",
        template: "verify-email",
        react: VerifyEmail({ name: user.name, url }),
      });
    },
  },

  session: {
    // Better Auth treats a session older than 24h as "not fresh" by default and
    // then refuses to list sessions — the devices panel would work for a day
    // and 403 forever after, which reads as a bug in the page rather than a
    // policy. We require a password on the genuinely dangerous action instead.
    // Do not "fix" this back.
    freshAge: 0,
  },

  user: {
    additionalFields: {
      // The PLATFORM admin flag, gating /settings/system only. Nothing to do
      // with organisation owner/admin/member roles.
      // `input: false` is the security control, not a formality: without it a
      // user can set their own role to "admin" through the ordinary update
      // call.
      role: {
        type: ["user", "admin"],
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      // The callback is `sendChangeEmailConfirmation` in this version of
      // better-auth — an easy one to get wrong, because a misnamed key is
      // silently ignored and the change simply never sends anything.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        void sendEmail({
          to: newEmail,
          subject: "Confirm your new email for Lanes",
          template: "verify-email",
          react: VerifyEmail({ name: user.name, url }),
        });
      },
    },
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        void sendEmail({
          to: user.email,
          subject: "Confirm you want to delete your Lanes account",
          template: "confirm-delete",
          react: ConfirmDelete({ name: user.name, url }),
        });
      },
      // The sole-Owner case: a user who is the only Owner of an organisation
      // cannot simply vanish, or the organisation is orphaned with nobody able
      // to administer it. This throws with the organisations named.
      beforeDelete: async (user) => {
        await assertUserCanBeDeleted(user.id);
      },
      afterDelete: async (user) => {
        await cleanUpDeletedUser(user.id);
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          // The first account on the instance becomes the platform admin.
          // Two accounts created in the same instant could both come out
          // admin; for a new app with one owner that isn't worth solving.
          const [row] = await db.select({ n: count() }).from(userTable);
          return {
            data: { ...newUser, role: row.n === 0 ? "admin" : "user" },
          };
        },
      },
    },
  },

  rateLimit: {
    enabled: true,
    // In-memory storage does nothing across instances, which makes the resend
    // cooldown a suggestion rather than a limit.
    storage: "database",
    customRules: {
      "/send-verification-email": { window: 60, max: 2 },
      "/change-email": { window: 60, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/delete-user": { window: 60, max: 3 },
      "/forget-password": { window: 60, max: 3 },
    },
  },

  plugins: [
    organization({
      ac,
      roles,
      teams: {
        enabled: true,
        // Onboarding names the first team itself, so the plugin's unnamed
        // default team would only ever be a second, empty one.
        defaultTeam: { enabled: false },
      },
      organizationHooks: {
        // Every team gets its board and its three columns here, whichever code
        // path created the team. A team without a board is an invalid state the
        // board page would otherwise have to defend against.
        afterCreateTeam: async ({ team }) => {
          await seedBoardForTeam(team.id, team.name);
        },
      },
    }),
  ],
});

/** True when the given user id currently holds the platform-admin flag. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row?.role === "admin";
}
