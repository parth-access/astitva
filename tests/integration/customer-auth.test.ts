import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authSessions, users } from "../../src/db/schema";
import { provisionAdmin, readAdmin } from "../../src/modules/auth/admins";
import { createAuth } from "../../src/modules/auth/config";
import { createCustomerAuth, isCustomerAuthPath, readCustomer } from "../../src/modules/auth/customer-config";
import { hasDb, makeDb, resetData } from "./helpers";

/**
 * Customers' sign-in (email code) over HTTP, beside the admin's, and the wall
 * between them: a customer session never opens the admin, and an admin can't
 * sign in as a customer.
 */
const BASE = "http://localhost:3000";
const SECRET = "test-secret-test-secret-test-secret-123";

describe.skipIf(!hasDb)("customer sign-in", () => {
  const db = makeDb(4);
  const admin = createAuth(db, { baseURL: BASE, secret: SECRET });
  const shop = createCustomerAuth(db, { baseURL: BASE, secret: SECRET });
  let ip = 0;

  /** A browser for one of the two sign-ins: keeps its cookies, and has its own IP so rate limits don't leak between tests. */
  function browser(handler: (r: Request) => Promise<Response>, base: string) {
    const jar = new Map<string, string>();
    const addr = `10.1.0.${++ip}`;
    async function call(path: string, body?: unknown) {
      const res = await handler(
        new Request(`${BASE}${base}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": addr, cookie: cookieHeader() },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const i = pair!.indexOf("=");
        const [k, v] = [pair!.slice(0, i), pair!.slice(i + 1)];
        if (/max-age=0/i.test(c) || v === "") jar.delete(k);
        else jar.set(k, v);
      }
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    }
    const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return Object.assign(call, { jar, headers: () => new Headers({ cookie: cookieHeader() }) });
  }
  const customer = () => browser((r) => shop.handler(r), "/api/account");

  async function codeFor(email: string): Promise<string> {
    const { otp } = await shop.api.getVerificationOTP({ query: { email, type: "sign-in" } });
    return otp!;
  }

  async function signIn(email: string) {
    const call = customer();
    expect((await call("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(200);
    const res = await call("/sign-in/email-otp", { email, otp: await codeFor(email) });
    return { call, res };
  }

  beforeAll(async () => {
    await resetData(db);
    await provisionAdmin(admin, db, { email: "krishna@example.com", name: "Krishna", role: "owner" });
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("signs a new customer in with an emailed code, under its own cookie", async () => {
    const { call, res } = await signIn("Meera@Example.com");
    expect(res.status).toBe(200);
    expect([...call.jar.keys()]).toEqual(["astitva.session_token"]);

    const me = await readCustomer(shop, call.headers());
    expect(me?.email).toBe("meera@example.com");
    const [row] = await db.select().from(users).where(eq(users.email, "meera@example.com"));
    expect(row?.emailVerified).toBe(true);
    const sessions = await db.select({ kind: authSessions.kind }).from(authSessions).where(eq(authSessions.userId, row!.id));
    expect(sessions).toEqual([{ kind: "customer" }]);

    // Signing in again finds the same account.
    await signIn("meera@example.com");
    expect(await db.select().from(users).where(eq(users.email, "meera@example.com"))).toHaveLength(1);
  });

  it("never lets a customer session open the admin, even in the admin's cookie", async () => {
    const { call } = await signIn("tara@example.com");
    const token = call.jar.get("astitva.session_token")!;
    // The same signed token, moved into the admin's cookie by hand.
    const forged = new Headers({ cookie: `better-auth.session_token=${token}` });
    expect((await admin.api.getSession({ headers: forged }))?.session.kind).toBe("customer");
    expect(await readAdmin(admin, db, forged)).toBeNull();
  });

  it("refuses an admin's email, and gives the admin sign-in nothing for a customer", async () => {
    const { res } = await signIn("krishna@example.com");
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("ADMIN_ACCOUNT");
    const [krishna] = await db.select().from(users).where(eq(users.email, "krishna@example.com"));
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, krishna!.id))).toEqual([]);

    // And the other way: the admin's instance makes no session for a customer.
    const [meera] = await db.select().from(users).where(eq(users.email, "meera@example.com"));
    const ctx = await admin.$context;
    await expect(ctx.internalAdapter.createSession(meera!.id)).rejects.toThrow(/no admin access/);
  });

  it("takes 5 wrong codes, then wants a new one", async () => {
    const call = customer();
    const email = "asha@example.com";
    await call("/email-otp/send-verification-otp", { email, type: "sign-in" });
    const right = await codeFor(email);
    const wrong = right === "000000" ? "111111" : "000000";
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await call("/sign-in/email-otp", { email, otp: wrong })).status);
    expect(statuses.every((s) => s === 400 || s === 403)).toBe(true);
    expect((await call("/sign-in/email-otp", { email, otp: right })).status).not.toBe(200);
  });

  it("limits how many codes one email gets", async () => {
    const email = "flood@example.com";
    const statuses: number[] = [];
    // A new browser (IP) each time, so only the per-email limit is in play.
    for (let i = 0; i < 5; i++) statuses.push((await customer()("/email-otp/send-verification-otp", { email, type: "sign-in" })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429]);
  });

  it("sends only sign-in codes", async () => {
    const res = await customer()("/email-otp/send-verification-otp", { email: "meera@example.com", type: "forget-password" });
    expect(res.status).toBe(400);
  });

  it("opens only the sign-in paths", () => {
    expect(isCustomerAuthPath("/api/account/sign-in/email-otp")).toBe(true);
    expect(isCustomerAuthPath("/api/account/callback/google")).toBe(true);
    expect(isCustomerAuthPath("/api/account/email-otp/reset-password")).toBe(false);
    expect(isCustomerAuthPath("/api/account/update-user")).toBe(false);
    expect(isCustomerAuthPath("/api/account/sign-in/email-otp/")).toBe(false);
    expect(isCustomerAuthPath("/api/accountx/sign-in/email-otp")).toBe(false);
  });
});
