import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// `mcp` has no `better-auth/plugins/mcp` subpath in 1.6.30 — it is missing from
// the package's `exports` map, so the aggregate entry point is the only import
// that resolves. Deliberately not the per-plugin path the docs suggest.
import { mcp, organization } from "better-auth/plugins";
import { count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/auth-schema";
import { ac, roles } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
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

  /**
   * Force the consent screen on every MCP authorisation.
   *
   * Better Auth 1.6.30's `mcp` plugin shows a consent page only when the
   * *client* asks for one with `prompt=consent` — unlike its OIDC provider,
   * it never consults the `oauth_consent` table and never prompts on its own.
   * Claude does not send `prompt`, so without this an authorisation code is
   * minted the moment a signed-in user lands on the authorize URL, with nothing
   * shown and nothing to approve.
   *
   * Claude's connector documentation is explicit that every connection requires
   * user consent, so this rewrites the query on the way in. It is done here, on
   * the endpoint itself, rather than by advertising a wrapper URL in the
   * discovery document: a wrapper only covers clients that read discovery, and
   * `/mcp/authorize` would still be reachable directly.
   *
   * The resumed-after-sign-in path is covered too — the plugin stores this
   * query in a cookie and replays it, so the flag survives the round-trip.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/mcp/authorize") return;
      // Returned, not mutated: a before-hook is handed a shallow copy of the
      // context, so assigning to `ctx.query` changes nothing. Only what comes
      // back under `context` is merged into the request the endpoint sees.
      return { context: { query: { ...ctx.query, prompt: "consent" } } };
    }),
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
      // Claude registers a *new* OAuth client on every fresh connection, so this
      // is a brake on abuse rather than on normal use — a person adding the
      // connector hits it once. Too tight here and legitimate connects fail.
      "/mcp/register": { window: 60, max: 10 },
      "/mcp/token": { window: 60, max: 30 },
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

    /**
     * The OAuth 2.1 authorisation server behind `/mcp`.
     *
     * This is what makes Lanes installable as a Claude connector: dynamic client
     * registration, S256 PKCE and refresh tokens, all of which Claude requires.
     * The plugin wraps better-auth's OIDC provider — `oidcConfig` is that
     * provider's options, not a second set of MCP ones.
     */
    mcp({
      loginPage: "/sign-in",
      /**
       * The protected resource identifier, and the one value that is easy to get
       * wrong. It must equal the URL the user types into Claude *exactly*, path
       * and all — Claude compares them and refuses a mismatch. The plugin's
       * default is the bare origin, which never matches a server mounted on a
       * path.
       *
       * It follows that APP_URL/BETTER_AUTH_URL must be the public HTTPS origin
       * in production; a stale localhost here breaks the connector rather than
       * merely a canonical tag.
       */
      resource: `${siteUrl}/mcp`,
      oidcConfig: {
        loginPage: "/sign-in",
        consentPage: "/oauth/consent",
        // Without this there is no `registration_endpoint`, and Claude has no
        // way to become a client of this server.
        allowDynamicClientRegistration: true,
        // The discovery document advertises S256 only, so accepting `plain`
        // would mean honouring a downgrade nobody is allowed to ask for.
        allowPlainCodeChallengeMethod: false,
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
