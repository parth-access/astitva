import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { adminRoleAssignments } from "@/db/schema";
import { env } from "@/lib/env";
import { readAdmin, type Admin } from "./admins";
import { createAuth } from "./config";

export const auth = createAuth(db, { baseURL: env().APP_URL, secret: env().BETTER_AUTH_SECRET });

export type AdminRole = (typeof adminRoleAssignments.$inferSelect)["role"];
export type { Admin };

/** The signed-in admin and their role, read once per request. Null when signed out. */
export const getAdmin = cache(async (): Promise<Admin | null> => readAdmin(auth, db, await headers()));

/**
 * The gate for every admin page and server action. The proxy's cookie check
 * is only a shortcut; this is the real check.
 *
 * Signed out → login. No admin role → login with a "no access" notice.
 * 2FA not set up yet → the setup page, which is all such a session can reach.
 */
export async function requireAdmin(opts: { roles?: AdminRole[] } = {}): Promise<Admin & { role: AdminRole }> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (!admin.role || (opts.roles && !opts.roles.includes(admin.role))) redirect("/admin/login?denied=1");
  if (!admin.user.twoFactorEnabled) redirect("/admin/setup-2fa");
  return { ...admin, role: admin.role };
}
