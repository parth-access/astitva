import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { auditLogs, cartItems, storeSettings, users } from "../../src/db/schema";
import { logActivity } from "../../src/modules/activity/log";
import { listActivity } from "../../src/modules/activity/feed";
import { getLiveNow } from "../../src/modules/activity/now";
import { addToBag, openBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import { clearOldActivity, runJob } from "../../src/modules/jobs/service";
import { packOrder } from "../../src/modules/orders/fulfilment";
import { createVariant, hasDb, makeDb, payOrder, resetData } from "./helpers";

const mail = { send: async () => {}, ctx: { appUrl: "https://astitva.test", linkSecret: "s".repeat(32) } };

function buyer(): CheckoutInput {
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone: "9812345678", email: "asha@example.com" },
    address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
  };
}

describe.skipIf(!hasDb)("the activity log", () => {
  const db = makeDb(4);
  let admin: string;

  async function placed() {
    const v = await createVariant(db, { onHand: 3, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    return { v, bagId: bag.id, ...(await placeOrder(db, bag.id, buyer())) };
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, reservationTtlMinutes: 15 });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    admin = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("tells an order's whole story: checkout, payment, stock, emails, and each action once", async () => {
    const { orderId, orderNumber } = await placed();
    await payOrder(db, orderId);
    await packOrder(db, orderId, admin);

    const { rows } = await listActivity(db, { orderId, limit: 100 });
    const kinds = rows.map((r) => r.kind);
    for (const k of ["order.awaiting_payment", "payment.captured", "order.placed", "stock.sale", "email.order_placed", "order.packed"]) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === "order.packed")).toHaveLength(1);
    expect(rows.every((r) => r.orderNumber === orderNumber)).toBe(true);
    expect(rows.find((r) => r.kind === "order.packed")).toMatchObject({ actorName: "Krishna", category: "orders" });
    // Newest first.
    expect(rows.map((r) => r.at.getTime())).toEqual([...rows.map((r) => r.at.getTime())].sort((a, b) => b - a));
  });

  it("filters by kind of thing, words and dates, and pages without repeating a row", async () => {
    const { orderNumber } = await placed();
    for (let i = 0; i < 5; i++) await logActivity(db, { actorId: admin, action: "settings.updated", resourceType: "store_settings", resourceId: "1", metadata: { orderingOpen: true } });

    expect((await listActivity(db, { category: "settings" })).rows).toHaveLength(5);
    expect((await listActivity(db, { category: "orders" })).rows.map((r) => r.kind)).toEqual(["order.awaiting_payment"]);
    expect((await listActivity(db, { search: orderNumber })).rows.length).toBeGreaterThan(0);
    expect((await listActivity(db, { search: "100%_nobody" })).rows).toHaveLength(0);
    expect((await listActivity(db, { to: new Date("2000-01-01") })).rows).toHaveLength(0);

    const first = await listActivity(db, { category: "settings", limit: 3 });
    expect(first.next).toBeTruthy();
    const second = await listActivity(db, { category: "settings", limit: 3, before: first.next! });
    expect(second.next).toBeNull();
    const ids = [...first.rows, ...second.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("records a scheduled job's work, and hides runs that did nothing", async () => {
    await runJob(db, "frequent", mail);
    expect((await db.select().from(auditLogs).where(sql`action = 'job.ran'`))).toHaveLength(1);
    expect((await listActivity(db, { category: "system" })).rows).toHaveLength(0);
    expect((await getLiveNow(db)).lastJobAt).toBeInstanceOf(Date);

    await placed();
    await db.execute(sql`update orders set created_at = now() - interval '3 hours'`);
    await runJob(db, "frequent", mail);
    const { rows } = await listActivity(db, { category: "system" });
    expect(rows.map((r) => r.kind)).toEqual(["job.ran"]);
  });

  it("clears only quiet job runs and bag changes, once they're old", async () => {
    const log = (action: string, metadata = {}) => logActivity(db, { action, resourceType: "job", resourceId: "frequent", metadata });
    await log("job.ran", { busy: false });
    await log("job.ran", { busy: true });
    await log("bag.added");
    await log("settings.updated");
    expect(await clearOldActivity(db)).toBe(0);
    await db.execute(sql`update audit_logs set created_at = now() - interval '40 days'`);
    expect(await clearOldActivity(db)).toBe(2);
    expect((await db.select({ action: auditLogs.action }).from(auditLogs)).map((r) => r.action).sort()).toEqual(["job.ran", "settings.updated"]);
  });

  it("shows what's happening now", async () => {
    const { orderId } = await placed();
    let live = await getLiveNow(db);
    expect(live.checkouts).toHaveLength(1);
    expect(live.checkouts[0]).toMatchObject({ id: orderId, totalMinor: 349_900 });
    expect(live.checkouts[0]!.holdEndsAt).toBeInstanceOf(Date);
    expect(live).toMatchObject({ unitsOnHold: 1, bags: { bags: 1, units: 1, minor: 349_900 }, jobLate: false });

    await db.update(cartItems).set({ updatedAt: new Date(Date.now() - 2 * 3_600_000) });
    live = await getLiveNow(db);
    expect(live.bags.bags).toBe(0);

    await payOrder(db, orderId);
    live = await getLiveNow(db);
    expect(live).toMatchObject({ checkouts: [], unitsOnHold: 0, emailsWaiting: 1 });
  });

  it("never lets a failed log line break what it records", async () => {
    await expect(logActivity(db, { action: "x".repeat(100), resourceType: "job", resourceId: "1" })).resolves.toBeUndefined();
  });
});
