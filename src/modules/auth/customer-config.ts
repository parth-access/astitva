import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import type { DbOrTx } from "@/db/create";
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { renderSignInCode } from "@/modules/email/templates";
import { allow, LIMITS } from "@/modules/limits/service";
import { isAdminUser, refuseAdmin, sessionKindField } from "./kinds";

/**
 * Better Auth for customers' accounts: a 6-digit code by email, or Google.
 * No passwords. Framework-free so tests can build their own instance; the
 * app uses the one in ./customer.ts, mounted at /api/account, where only the
 * paths in CUSTOMER_AUTH_PATHS are open.
 *
 * It shares the users and sessions tables with the admin's instance, but
 * makes `customer` sessions under its own cookie, and refuses admins (see ./kinds).
 */
export type CustomerAuthOptions = {
  baseURL: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
};

export const CUSTOMER_AUTH_BASE = "/api/account";
export const CODE_MINUTES = 10;

const DAY = 60 * 60 * 24;

/** The endpoints the browser may reach. Everything else (password resets, email changes, …) stays shut. */
export const CUSTOMER_AUTH_PATHS = [
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/sign-in/social",
  "/callback/google",
  "/get-session",
  "/sign-out",
] as const;

/** Whether a path under /api/account is one of the open ones. */
export function isCustomerAuthPath(pathname: string): boolean {
  return (CUSTOMER_AUTH_PATHS as readonly string[]).includes(pathname.slice(CUSTOMER_AUTH_BASE.length)) && pathname.startsWith(`${CUSTOMER_AUTH_BASE}/`);
}

export function createCustomerAuth(db: DbOrTx, opts: CustomerAuthOptions) {
  return betterAuth({
    appName: "Astitva",
    baseURL: opts.baseURL,
    secret: opts.secret,
    basePath: CUSTOMER_AUTH_BASE,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Its own cookie, apart from the admin's "better-auth" one.
      cookiePrefix: "astitva",
    },
    emailAndPassword: { enabled: false },
    socialProviders: opts.google ? { google: { ...opts.google, prompt: "select_account" } } : {},
    // Google proves the address, so signing in with Google finds the account an email code made, and the other way round.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    session: { expiresIn: 60 * DAY, updateAge: DAY, additionalFields: sessionKindField("customer") },
    databaseHooks: {
      session: {
        create: {
          async before(session) {
            if (await isAdminUser(db, session.userId)) refuseAdmin();
          },
        },
      },
      account: {
        create: {
          async before(account) {
            if (await isAdminUser(db, account.userId)) refuseAdmin();
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/send-verification-otp") return;
        const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
        if (body?.type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Only sign-in codes are sent here." });
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email && !(await allow(db, LIMITS.signInCodeEmail, email, opts.secret))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "We've sent a few codes to this email already. Please wait a quarter of an hour." });
        }
      }),
    },
    // Google sign-in errors land on the sign-in page, which explains them.
    onAPIError: { errorURL: "/account/sign-in" },
    rateLimit: {
      enabled: true,
      storage: "database",
      // Per network. Generous, because many mobile users share one address; codes are also limited per email.
      customRules: {
        "/email-otp/send-verification-otp": { window: 10 * 60, max: 10 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_MINUTES * 60,
        allowedAttempts: 5,
        // Asking again sends the same code while it's valid, so an earlier email still works.
        storeOTP: "encrypted",
        resendStrategy: "reuse",
        async sendVerificationOTP({ email, otp }) {
          await sendEmail({ to: email, ...renderSignInCode({ otp, minutes: CODE_MINUTES, appUrl: opts.baseURL.replace(/\/$/, "") }) });
        },
      }),
      // Lets server actions set the session cookie. Must stay last.
      nextCookies(),
    ],
  });
}

export type CustomerAuth = ReturnType<typeof createCustomerAuth>;

export type Customer = { id: string; name: string; email: string };

/** The signed-in customer, from the request's headers. Null when signed out, and for anything but a customer session. */
export async function readCustomer(auth: CustomerAuth, headers: Headers): Promise<Customer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session || session.session.kind !== "customer") return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}
