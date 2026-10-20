import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Browser client for the sign-in forms. They call /api/auth over HTTP rather
 * than through server actions, because Better Auth's rate limits only apply
 * to requests that reach its route handler.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [twoFactorClient()],
});

/** Better Auth error codes, in Krishna's language. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "INVALID_CODE":
      return "That code didn't work. Codes change every 30 seconds; try the current one.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in timed out. Sign in again.";
    case "INVALID_BACKUP_CODE":
      return "That backup code didn't work. Each one can be used once.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many wrong codes. The account is locked for a few minutes.";
    case "INVALID_PASSWORD":
      return "That password isn't right.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 12 characters.";
    case "INVALID_TOKEN":
      return "This link has expired or was already used. Ask for a new one.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}
