import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { renderAccountCode, type CodePurpose } from "@/modules/email/templates";
import { allow, LIMITS } from "@/modules/limits/service";
import { isAdminUser, refuseAdmin, sessionKindField } from "./kinds";

/**
 * Better Auth for customers' accounts: email and password, a 6-digit code by
 * email, or Google. Framework-free so tests can build their own instance; the
 * app uses the one in ./customer.ts, mounted at /api/account, where only the
 * paths in CUSTOMER_AUTH_PATHS are open. Signing up goes through a server
 * action (src/app/(store)/account/actions.ts), which checks the form first.
 *
 * It shares the users and sessions tables with the admin's instance, but
 * makes `customer` sessions under its own cookie, and refuses admins (see
 * ./kinds): an admin's email gets no reset or verification codes from here,
 * and its password can't be reset here.
 *
 * An email isn't proved until the customer types a code sent to it (or signs
 * in with a code or Google). Until then it finds none of their guest orders,
 * and Google won't attach itself to the account.
 */
export type CustomerAuthOptions = {
  baseURL: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
};

export const CUSTOMER_AUTH_BASE = "/api/account";
export const CODE_MINUTES = 10;
export const CUSTOMER_PASSWORD_MIN = 8;

const DAY = 60 * 60 * 24;

/** The codes customers can ask for: to sign in, to prove their email, to set a new password. */
const CODE_PURPOSES: CodePurpose[] = ["sign-in", "email-verification", "forget-password"];

async function isAdminEmail(db: DbOrTx, email: string): Promise<boolean> {
  const [user] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  return user ? isAdminUser(db, user.id) : false;
}

/** The endpoints the browser may reach. Everything else (email changes, account updates, …) stays shut. */
export const CUSTOMER_AUTH_PATHS = [
  "/sign-in/email",
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/email-otp/verify-email",
  "/email-otp/reset-password",
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
    emailAndPassword: {
      enabled: true,
      // Customers can shop before verifying; their email finds old orders only once it's verified.
      requireEmailVerification: false,
      minPasswordLength: CUSTOMER_PASSWORD_MIN,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: { additionalFields: { phone: { type: "string", required: false, input: true } } },
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
        const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

        if (ctx.path === "/email-otp/send-verification-otp") {
          if (!CODE_PURPOSES.includes(body?.type as CodePurpose)) throw new APIError("BAD_REQUEST", { message: "That kind of code isn't sent here." });
          if (email && !(await allow(db, LIMITS.signInCodeEmail, email, opts.secret))) {
            throw new APIError("TOO_MANY_REQUESTS", { message: "We've sent a few codes to this email already. Please wait a quarter of an hour." });
          }
          // The admin's password and email are looked after in the admin, never from here. Same answer as for anyone.
          if (body?.type !== "sign-in" && email && (await isAdminEmail(db, email))) return ctx.json({ success: true });
          return;
        }
        if (ctx.path === "/email-otp/reset-password" && email && (await isAdminEmail(db, email))) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
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
        "/sign-in/email": { window: 60, max: 10 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/reset-password": { window: 60, max: 10 },
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
        async sendVerificationOTP({ email, otp, type }) {
          const purpose: CodePurpose = type === "email-verification" || type === "forget-password" ? type : "sign-in";
          await sendEmail({ to: email, ...renderAccountCode({ otp, purpose, minutes: CODE_MINUTES, appUrl: opts.baseURL.replace(/\/$/, "") }) });
        },
      }),
      // Lets server actions set the session cookie. Must stay last.
      nextCookies(),
    ],
  });
}

export type CustomerAuth = ReturnType<typeof createCustomerAuth>;

/** A path to return to after signing in: one of ours, never another site. */
export function safeNext(next: unknown, fallback = "/account"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

export type Customer = { id: string; name: string; email: string; emailVerified: boolean };

/** The signed-in customer, from the request's headers. Null when signed out, and for anything but a customer session. */
export async function readCustomer(auth: CustomerAuth, headers: Headers): Promise<Customer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session || session.session.kind !== "customer") return null;
  const { id, name, email, emailVerified } = session.user;
  return { id, name, email, emailVerified: emailVerified === true };
}
