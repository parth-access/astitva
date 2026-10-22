import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { adminRoleAssignments } from "@/db/schema";

/**
 * Admins and customers sign in through two Better Auth instances that share
 * the users and sessions tables and the secret. A session's `kind` says which
 * one made it, and each side accepts only its own:
 *
 * - The admin instance (password + 2FA) makes `admin` sessions, only for
 *   people with an admin role.
 * - The customer instance (email code, Google) makes `customer` sessions,
 *   only for people without one. Otherwise anyone who got into an admin's
 *   inbox could sign in with an emailed code and skip the password and 2FA.
 */
export type SessionKind = "admin" | "customer";

/** Declares `kind` to Better Auth. The instance's own kind is the default; it can't be sent in. */
export function sessionKindField(kind: SessionKind) {
  return { kind: { type: "string", required: true, input: false, defaultValue: kind } } as const;
}

export async function isAdminUser(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: adminRoleAssignments.userId }).from(adminRoleAssignments).where(eq(adminRoleAssignments.userId, userId));
  return Boolean(row);
}

/** Customer sign-ins refuse admins with this code; the account pages explain it. */
export const ADMIN_ACCOUNT = "ADMIN_ACCOUNT";

export function refuseAdmin(): never {
  throw new APIError("FORBIDDEN", { code: ADMIN_ACCOUNT, message: "This email belongs to the admin. To shop, use another email." });
}

export function refuseNonAdmin(): never {
  throw new APIError("FORBIDDEN", { message: "This account has no admin access." });
}
