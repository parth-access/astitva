/**
 * Creates an admin account, or gives an existing person admin access, and
 * sends them a link to set their password. There is no public sign-up.
 *
 *   npm run admin:create -- --email krishna@example.com --name "Krishna"
 *   npm run admin:create -- --email parth@example.com --name "Parth" --role owner
 *
 * Running it again for an existing admin sends a fresh link (a password reset).
 * The link goes by email through Resend; without RESEND_API_KEY it is printed
 * here instead. It opens APP_URL, so set APP_URL to the live site when running
 * this against the production database.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createDb } from "../src/db/create";
import { ADMIN_ROLES, provisionAdmin, type AdminRoleName } from "../src/modules/auth/admins";
import { createAuth } from "../src/modules/auth/config";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "owner" } },
});
const email = values.email?.trim().toLowerCase();
const role = values.role as AdminRoleName;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Pass --email with a valid address.");
if (!ADMIN_ROLES.includes(role)) fail(`--role must be one of: ${ADMIN_ROLES.join(", ")}.`);

const { DATABASE_URL, APP_URL = "http://localhost:3000", BETTER_AUTH_SECRET } = process.env;
if (!DATABASE_URL) fail("DATABASE_URL is not set.");
if (!BETTER_AUTH_SECRET || BETTER_AUTH_SECRET.length < 32) fail("BETTER_AUTH_SECRET is not set (32+ characters).");

const db = createDb(DATABASE_URL, { max: 1 });
const auth = createAuth(db, { baseURL: APP_URL, secret: BETTER_AUTH_SECRET });

try {
  const { created } = await provisionAdmin(auth, db, { email, name: values.name, role });
  await auth.api.requestPasswordReset({ body: { email, redirectTo: `${APP_URL}/admin/reset-password` } });
  console.log(`${created ? "Created" : "Updated"} ${email} as ${role}. A link to set the password was sent (valid for 1 hour).`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await db.$client.end();
}
