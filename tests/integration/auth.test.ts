import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { adminRoleAssignments, authVerifications, users } from "../../src/db/schema";
import { provisionAdmin } from "../../src/modules/auth/admins";
import { createAuth } from "../../src/modules/auth/config";
import { hasDb, makeDb, resetData } from "./helpers";

/**
 * The admin sign-in flow over HTTP, as the browser forms use it, so Better
 * Auth's origin check and rate limits are in play.
 */
const BASE = "http://localhost:3000";
const PASSWORD = "a long enough test passphrase";

describe.skipIf(!hasDb)("admin sign-in", () => {
  const db = makeDb(4);
  const auth = createAuth(db, { baseURL: BASE, secret: "test-secret-test-secret-test-secret-123" });
  let ip = 0;

  /** A browser: keeps cookies between calls. Each gets its own IP so rate limits don't leak between tests. */
  function browser() {
    const jar = new Map<string, string>();
    const addr = `10.0.0.${++ip}`;
    return async function call(path: string, body?: unknown) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE,
            "x-forwarded-for": addr,
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const [k, v] = pair!.split("=");
        if (/max-age=0/i.test(c) || v === "") jar.delete(k!);
        else jar.set(k!, v!);
      }
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    };
  }

  async function setPassword(email: string) {
    const call = browser();
    await call("/request-password-reset", { email, redirectTo: `${BASE}/admin/reset-password` });
    const [row] = await db.select().from(authVerifications).where(like(authVerifications.identifier, "reset-password:%"));
    const token = row!.identifier.slice("reset-password:".length);
    return call("/reset-password", { newPassword: PASSWORD, token });
  }

  function totpFromUri(uri: string) {
    const secret = new TextDecoder().decode(base32.decode(new URL(uri).searchParams.get("secret")!));
    return createOTP(secret).totp();
  }

  beforeAll(async () => {
    await resetData(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("has no public sign-up", async () => {
    const res = await browser()("/sign-up/email", { email: "someone@example.com", password: PASSWORD, name: "Someone" });
    expect(res.status).toBe(400);
    expect(await db.select().from(users)).toEqual([]);
  });

  it("provisions an admin who sets a password through the emailed link", async () => {
    const { userId, created } = await provisionAdmin(auth, db, { email: "Krishna@Example.com", name: "Krishna", role: "owner" });
    expect(created).toBe(true);
    const [role] = await db.select().from(adminRoleAssignments).where(eq(adminRoleAssignments.userId, userId));
    expect(role?.role).toBe("owner");

    // The random initial password is unknown, so sign-in fails until the link is used.
    expect((await browser()("/sign-in/email", { email: "krishna@example.com", password: PASSWORD })).status).toBe(401);
    expect((await setPassword("krishna@example.com")).status).toBe(200);

    // Running it again changes nothing but the role.
    expect((await provisionAdmin(auth, db, { email: "krishna@example.com", role: "owner" })).created).toBe(false);
  });

  it("requires the 6-digit code once 2FA is on, and rejects a wrong one", async () => {
    const call = browser();
    const first = await call("/sign-in/email", { email: "krishna@example.com", password: PASSWORD });
    expect(first.status).toBe(200);
    expect(first.json.twoFactorRedirect).toBeUndefined();
    // Signed in, but without 2FA: requireAdmin() only lets this session reach the setup page.
    expect((await call("/get-session")).json.user.twoFactorEnabled).toBe(false);

    const enabled = await call("/two-factor/enable", { password: PASSWORD, method: "totp" });
    expect(enabled.status).toBe(200);
    expect(enabled.json.backupCodes).toHaveLength(10);
    const uri: string = enabled.json.totpURI;
    expect((await call("/two-factor/verify-totp", { code: await totpFromUri(uri) })).status).toBe(200);
    expect((await call("/get-session")).json.user.twoFactorEnabled).toBe(true);

    // A new device: the password alone gives no session.
    const phone = browser();
    const signIn = await phone("/sign-in/email", { email: "krishna@example.com", password: PASSWORD });
    expect(signIn.json.twoFactorRedirect).toBe(true);
    expect((await phone("/get-session")).json).toBeNull();

    expect((await phone("/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
    expect((await phone("/get-session")).json).toBeNull();

    expect((await phone("/two-factor/verify-totp", { code: await totpFromUri(uri) })).status).toBe(200);
    expect((await phone("/get-session")).json.user.email).toBe("krishna@example.com");
  });

  it("rate-limits password guessing", async () => {
    const call = browser();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await call("/sign-in/email", { email: "krishna@example.com", password: `wrong guess ${i}!` })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.at(-1)).toBe(429);
  });
});
