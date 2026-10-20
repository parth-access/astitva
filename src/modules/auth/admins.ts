import { randomBytes } from "node:crypto";
import type { Db } from "@/db/create";
import { adminRoleAssignments, auditLogs } from "@/db/schema";
import type { Auth } from "./config";

export const ADMIN_ROLES = ["owner", "staff"] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

/**
 * Creates an admin, or gives an existing person admin access. The account gets
 * a random password nobody knows; the person sets their own through the
 * password link (see scripts/admin-create.ts). Framework-free for scripts and tests.
 */
export async function provisionAdmin(
  auth: Auth,
  db: Db,
  input: { email: string; name?: string; role: AdminRoleName },
): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const ctx = await auth.$context;

  let user = (await ctx.internalAdapter.findUserByEmail(email))?.user;
  const created = !user;
  if (!user) {
    const name = input.name?.trim();
    if (!name) throw new Error("A new admin needs a name.");
    user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" });
  }

  // A password sign-in needs a credential account.
  const accounts = await ctx.internalAdapter.findAccounts(user.id);
  if (!accounts.some((a) => a.providerId === "credential")) {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(randomBytes(32).toString("base64url")),
    });
  }

  const userId = user.id;
  await db.transaction(async (tx) => {
    await tx
      .insert(adminRoleAssignments)
      .values({ userId, role: input.role })
      .onConflictDoUpdate({ target: adminRoleAssignments.userId, set: { role: input.role } });
    await tx.insert(auditLogs).values({
      actorId: null,
      action: created ? "admin.created" : "admin.role_set",
      resourceType: "user",
      resourceId: userId,
      metadata: { email, role: input.role },
    });
  });

  return { userId, created };
}
