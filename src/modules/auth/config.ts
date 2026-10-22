import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
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
      // Lets server actions set the session cookie. Must stay last.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
