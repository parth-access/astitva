import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminRoleAssignments } from "@/db/schema";
import { env } from "@/lib/env";
import { createAuth } from "./config";

export const auth = createAuth(db, { baseURL: env().APP_URL, secret: env().BETTER_AUTH_SECRET });

export type AdminRole = (typeof adminRoleAssignments.$inferSelect)["role"];
export type Admin = {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  role: AdminRole | null;
};

/** The signed-in person and their admin role, read once per request. Null when signed out. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await db
    .select({ role: adminRoleAssignments.role })
    .from(adminRoleAssignments)
    .where(eq(adminRoleAssignments.userId, session.user.id));
  const { id, name, email, twoFactorEnabled } = session.user;
  return { user: { id, name, email, twoFactorEnabled: twoFactorEnabled === true }, role: row?.role ?? null };
});

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
