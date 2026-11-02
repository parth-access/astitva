import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { emailOutbox, orders, payments, refunds, stockAlerts } from "../../src/db/schema";
import { addToBag, openBag } from "../../src/modules/bag/service";
import { placeOrder } from "../../src/modules/checkout/service";
import { ABANDON_AFTER_MINUTES, runJob } from "../../src/modules/jobs/service";
import { RECONCILE_AFTER_MINUTES } from "../../src/modules/payments/refunds";
import { createVariant, expireHolds, hasDb, makeDb, payOrder, resetData } from "./helpers";

const mail = { send: async () => {}, ctx: { appUrl: "https://astitva.test", linkSecret: "s".repeat(32) } };

/** The check that decides whether the database wakes the site. If it says no, the job doesn't run. */
describe.skipIf(!hasDb)("is there work for the frequent job?", () => {
  const db = makeDb(6);

  const hasWork = async () => {
    const { rows } = await db.execute<{ work: boolean }>(sql`select private.housekeeping_has_work() as work`);
    return rows[0]!.work;
  };
  const clearEmails = () => db.update(emailOutbox).set({ status: "sent", sentAt: new Date() });

  async function unpaid(onHand = 2) {
    const v = await createVariant(db, { onHand, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    const placed = await placeOrder(db, bag.id, {
      idempotencyKey: randomUUID(),
      contact: { name: "Asha Rao", phone: "9812345678", email: "asha@example.com" },
      address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
      note: "",
    });
    return { v, ...placed };
  }

  beforeEach(async () => {
    await resetData(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("says no in a quiet shop, even with a checkout under way", async () => {
    expect(await hasWork()).toBe(false);
    await unpaid();
    expect(await hasWork()).toBe(false);
  });

  it("says yes when a hold has lapsed, and no once the job has marked it", async () => {
    const { orderId } = await unpaid();
    await expireHolds(db, orderId);
    expect(await hasWork()).toBe(true);
    await runJob(db, "frequent", mail);
    expect(await hasWork()).toBe(false);
  });

  it("says yes at the same moment the job would close an unpaid checkout", async () => {
    const { orderId } = await unpaid();
    const aged = (minutes: number) =>
      db.update(orders).set({ createdAt: sql`now() - make_interval(mins => ${minutes})` }).where(eq(orders.id, orderId));

    await aged(ABANDON_AFTER_MINUTES - 1);
    expect(await hasWork()).toBe(false);
    await aged(ABANDON_AFTER_MINUTES + 1);
    expect(await hasWork()).toBe(true);
    await runJob(db, "frequent", mail);
    await clearEmails();
    expect(await hasWork()).toBe(false);
  });

  it("says yes for emails that are due, not ones waiting for their retry", async () => {
    const { orderId } = await unpaid();
    await payOrder(db, orderId);
    expect(await hasWork()).toBe(true);
    await db.update(emailOutbox).set({ nextAttemptAt: sql`now() + interval '5 minutes'` });
    expect(await hasWork()).toBe(false);
    await db.update(emailOutbox).set({ nextAttemptAt: sql`now()` });
    await runJob(db, "frequent", mail);
    expect(await hasWork()).toBe(false);
  });

  it("says yes for a Razorpay refund with no answer, once the job would check it", async () => {
    const { orderId } = await unpaid();
    await payOrder(db, orderId);
    await clearEmails();
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    const [refund] = await db
      .insert(refunds)
      .values({ orderId, paymentId: payment!.id, method: "razorpay", amountMinor: 100, reason: "Test" })
      .returning();
    const aged = (minutes: number) =>
      db.update(refunds).set({ createdAt: sql`now() - make_interval(mins => ${minutes})` }).where(eq(refunds.id, refund!.id));

    await aged(RECONCILE_AFTER_MINUTES - 1);
    expect(await hasWork()).toBe(false);
    await aged(RECONCILE_AFTER_MINUTES + 1);
    expect(await hasWork()).toBe(true);
    await db.update(refunds).set({ status: "succeeded" }).where(eq(refunds.id, refund!.id));
    expect(await hasWork()).toBe(false);
  });

  describe("back in stock", () => {
    it("says no while it's sold out or not on sale", async () => {
      const soldOut = await createVariant(db, { onHand: 0 });
      const draft = await createVariant(db, { onHand: 3, status: "draft" });
      await db.insert(stockAlerts).values([
        { variantId: soldOut.id, email: "a@example.com" },
        { variantId: draft.id, email: "b@example.com" },
      ]);
      expect(await hasWork()).toBe(false);
    });

    it("says yes when it can be bought, and no once everyone has been told", async () => {
      const v = await createVariant(db, { onHand: 1 });
      await db.insert(stockAlerts).values({ variantId: v.id, email: "a@example.com" });
      expect(await hasWork()).toBe(true);
      await runJob(db, "frequent", mail);
      expect(await db.select().from(stockAlerts).where(sql`notified_at is null`)).toEqual([]);
      expect(await hasWork()).toBe(false);
    });

    it("counts held stock as gone, until the hold lapses", async () => {
      const { v, orderId } = await unpaid(1);
      await db.insert(stockAlerts).values({ variantId: v.id, email: "a@example.com" });
      expect(await hasWork()).toBe(false);
      await expireHolds(db, orderId);
      await runJob(db, "frequent", mail);
      expect(await db.select().from(stockAlerts).where(sql`notified_at is null`)).toEqual([]);
    });
  });
});
