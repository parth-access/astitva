import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import type { DbOrTx } from "@/db/create";
import {
  authAccounts,
  authRateLimits,
  authSessions,
  authTwoFactors,
  authVerifications,
  users,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/modules/activity/log";
import { renderPasswordReset } from "@/modules/email/templates";
import { IP_HEADERS, PASSWORD_MIN_LENGTH } from "./constants";
import { isAdminUser, refuseNonAdmin, sessionKindField } from "./kinds";

/**
 * Better Auth for the admin. Framework-free so scripts and tests can build
 * their own instance; the app uses the one in ./auth.ts.
 *
 * - No public sign-up: accounts are created by `npm run admin:create`.
 * - 2FA (authenticator app) is required. Better Auth only challenges accounts
 *   that have it on, so requireAdmin() sends anyone without it to set it up.
 * - Rate limits live in the database: serverless instances don't share memory.
 * - Only admins get sessions here, and they're `admin` sessions (see ./kinds).
 *   Customers sign in through ./customer-config instead.
 */
export type AuthOptions = { baseURL: string; secret: string };

const DAY = 60 * 60 * 24;

const isSignInPath = (path: string | undefined) => path === "/sign-in/email" || path === "/request-password-reset" || !!path?.startsWith("/two-factor/verify");

/** What sign-in looks like from outside goes in the activity log: who, never a password or a code. */
function signInLog(db: DbOrTx) {
  return {
    id: "sign-in-log",
    hooks: {
      after: [
        {
          matcher: (ctx: { path?: string }) => isSignInPath(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned as { user?: { id?: string }; twoFactorRedirect?: boolean } | APIError | undefined;
            const failed = returned instanceof APIError;
            const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase().slice(0, 254);
            const unknown = { resourceType: "user", resourceId: "unknown" };
            if (ctx.path === "/request-password-reset") {
              if (!failed) await logActivity(db, { ...unknown, action: "admin.password_reset_requested", metadata: { email } });
            } else if (failed) {
              if (ctx.path === "/sign-in/email") await logActivity(db, { ...unknown, action: "admin.sign_in_failed", metadata: { email } });
              else await logActivity(db, { ...unknown, action: "admin.code_failed" });
            } else if (returned?.user?.id && !returned.twoFactorRedirect) {
              await logActivity(db, { actorId: returned.user.id, action: "admin.signed_in", resourceType: "user", resourceId: returned.user.id });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

export function createAuth(db: DbOrTx, opts: AuthOptions) {
  return betterAuth({
    appName: "Astitva",
    baseURL: opts.baseURL,
    secret: opts.secret,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        twoFactor: authTwoFactors,
        rateLimit: authRateLimits,
      },
    }),
    advanced: { database: { generateId: "uuid" }, ipAddress: { ipAddressHeaders: IP_HEADERS } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      async sendResetPassword({ user, url }) {
        // A customer's email gets nothing: this is the admin's password.
        if (!(await isAdminUser(db, user.id))) return;
        await sendEmail({ to: user.email, ...renderPasswordReset({ name: user.name, url, appUrl: opts.baseURL.replace(/\/$/, "") }) });
      },
    },
    session: { expiresIn: 7 * DAY, updateAge: DAY, additionalFields: sessionKindField("admin") },
    databaseHooks: {
      session: {
        create: {
          async before(session) {
            if (!(await isAdminUser(db, session.userId))) refuseNonAdmin();
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-out") return;
        const current = await getSessionFromCtx(ctx);
        if (current) await logActivity(db, { actorId: current.user.id, action: "admin.signed_out", resourceType: "user", resourceId: current.user.id });
      }),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60 * 15, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },
    plugins: [
      twoFactor({ issuer: "Astitva", trustDeviceMaxAge: 30 * DAY }),
      // After twoFactor, which replaces a password sign-in's answer when a code is still needed.
      signInLog(db),
      // Lets server actions set the session cookie. Must stay last.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
