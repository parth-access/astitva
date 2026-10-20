import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { adminRoleAssignments, emailOutbox, inventoryReservations, orders, storeSettings, users } from "../../src/db/schema";
import type { Email } from "../../src/lib/email";
import { addToBag, openBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import { alertError, MAX_ATTEMPTS, processOutbox } from "../../src/modules/email/outbox";
import { closeAbandonedCheckouts, runJob } from "../../src/modules/jobs/service";
import { allow, LIMITS } from "../../src/modules/limits/service";
import { shipOrder } from "../../src/modules/orders/fulfilment";
import { markCodVerified } from "../../src/modules/orders/service";
import { createVariant, hasDb, makeDb, onHand, resetData } from "./helpers";

const ctx = { appUrl: "https://astitva.test", linkSecret: "s".repeat(32) };

function buyer(method: "cod" | "online", email: string | null = "asha@example.com"): CheckoutInput {
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone: "9812345678", email },
    address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: "Please call first",
    paymentMethod: method,
  };
}

describe.skipIf(!hasDb)("emails, alerts, scheduled jobs and limits", () => {
  const db = makeDb(6);
  let owner: string;

  async function order(method: "cod" | "online", email: string | null = "asha@example.com") {
    const v = await createVariant(db, { onHand: 2, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    return { v, ...(await placeOrder(db, bag.id, buyer(method, email))) };
  }
  const outbox = () => db.select().from(emailOutbox).orderBy(emailOutbox.toAddress);

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, codEnabled: true, conciergeName: "Krishna" });
    const [k] = await db.insert(users).values({ name: "Krishna", email: "krishna@astitva.test" }).returning();
    const [p] = await db.insert(users).values({ name: "Parth", email: "parth@astitva.test" }).returning();
    const [staff] = await db.insert(users).values({ name: "Helper", email: "staff@astitva.test" }).returning();
    await db.insert(adminRoleAssignments).values([
      { userId: k!.id, role: "owner" },
      { userId: p!.id, role: "owner" },
      { userId: staff!.id, role: "staff" },
    ]);
    owner = k!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("a COD order queues the buyer's thank-you and an alert to each owner, and they render", async () => {
    const placed = await order("cod");
    const rows = await outbox();
    expect(rows.map((r) => [r.template, r.toAddress])).toEqual([
      ["order_placed", "asha@example.com"],
      ["owner_new_order", "krishna@astitva.test"],
      ["owner_new_order", "parth@astitva.test"],
    ]);

    const sent: Email[] = [];
    const result = await processOutbox(db, async (e) => void sent.push(e), ctx);
    expect(result).toEqual({ sent: 3, retrying: 0, gaveUp: 0 });
    const toBuyer = sent.find((e) => e.to === "asha@example.com")!;
    expect(toBuyer.subject).toBe(`Your Astitva order ${placed.orderNumber}`);
    expect(toBuyer.text).toMatch(/Krishna will message you on WhatsApp at \+91 98123 45678/);
    expect(toBuyer.text).toMatch(new RegExp(`https://astitva.test/orders/${placed.orderNumber}\\?k=`));
    expect(toBuyer.html).toContain("Thank you, Asha.");
    const toOwner = sent.find((e) => e.to === "krishna@astitva.test")!;
    expect(toOwner.subject).toBe(`New order ${placed.orderNumber} · ₹3,499 · cash on delivery`);
    expect(toOwner.text).toMatch(/Their note: Please call first/);
    expect(toOwner.text).toContain(`https://astitva.test/admin/orders/${placed.orderId}`);
    expect((await outbox()).every((r) => r.status === "sent")).toBe(true);

    // Nothing left to send; a second run sends nothing twice.
    expect(await processOutbox(db, async (e) => void sent.push(e), ctx)).toEqual({ sent: 0, retrying: 0, gaveUp: 0 });
  });

  it("an unpaid online checkout tells nobody; shipping tells the buyer, with the tracking", async () => {
    await order("online");
    expect(await outbox()).toHaveLength(0);

    const cod = await order("cod", "meera@example.com");
    await markCodVerified(db, cod.orderId, owner);
    await shipOrder(db, cod.orderId, owner, { carrierName: "Delhivery", trackingNumber: "AWB1", trackingUrl: "https://track.example/AWB1" });
    const sent: Email[] = [];
    await processOutbox(db, async (e) => void sent.push(e), ctx);
    const shipped = sent.find((e) => e.subject === "Your Astitva order is on its way")!;
    expect(shipped.to).toBe("meera@example.com");
    expect(shipped.text).toMatch(/handed to Delhivery\. Tracking number AWB1\. Please keep ₹3,499 ready/);
    expect(shipped.text).toContain("Track your parcel: https://track.example/AWB1");
  });

  it("retries with growing gaps, gives up after six tries, and two workers never double-send", async () => {
    await order("cod", null);
    const failing = async () => {
      throw new Error("Resend is down");
    };
    expect(await processOutbox(db, failing, ctx)).toEqual({ sent: 0, retrying: 2, gaveUp: 0 });
    const [row] = await outbox();
    expect(row).toMatchObject({ attempts: 1, status: "pending", lastError: "Resend is down" });
    expect(await processOutbox(db, failing, ctx)).toEqual({ sent: 0, retrying: 0, gaveUp: 0 }); // not due yet

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await db.execute(sql`update email_outbox set next_attempt_at = now() where status = 'pending'`);
      await processOutbox(db, failing, ctx);
    }
    expect((await outbox()).map((r) => [r.status, r.attempts])).toEqual([
      ["failed", MAX_ATTEMPTS],
      ["failed", MAX_ATTEMPTS],
    ]);

    // Two workers at once: each email goes out exactly once.
    await db.delete(emailOutbox);
    await order("cod");
    const sent: string[] = [];
    const slowSend = async (e: Email) => {
      await new Promise((r) => setTimeout(r, 30));
      sent.push(e.to);
    };
    await Promise.all([processOutbox(db, slowSend, ctx), processOutbox(db, slowSend, ctx)]);
    expect(sent.sort()).toEqual(["asha@example.com", "krishna@astitva.test", "parth@astitva.test"]);
  });

  it("error alerts reach the owners at most once an hour per kind", async () => {
    await alertError(db, "Razorpay webhook", "boom");
    await alertError(db, "Razorpay webhook", "boom again");
    await alertError(db, "Refund", "nope");
    const rows = await outbox();
    expect(rows.filter((r) => r.template === "owner_error")).toHaveLength(4);
    const sent: Email[] = [];
    await processOutbox(db, async (e) => void sent.push(e), ctx);
    expect(sent.map((e) => e.subject)).toContain("Astitva: Razorpay webhook failed");
  });

  it("closes online checkouts nobody paid for and frees their stock", async () => {
    const fresh = await order("online");
    const stale = await order("online");
    await db.execute(sql`update orders set created_at = now() - interval '3 hours' where id = ${stale.orderId}`);
    await db.execute(sql`update inventory_reservations set expires_at = now() + interval '1 hour' where order_id = ${stale.orderId}`);
    expect(await onHand(db, stale.v.id)).toBe(2);

    expect(await closeAbandonedCheckouts(db)).toBe(1);
    expect((await db.select().from(orders).where(eq(orders.id, stale.orderId)))[0]).toMatchObject({ orderStatus: "cancelled", cancelReason: "Not paid within two hours" });
    expect((await db.select().from(orders).where(eq(orders.id, fresh.orderId)))[0]!.orderStatus).toBe("pending_payment");
    const [hold] = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, stale.orderId));
    expect(hold!.status).toBe("released");

    const result = await runJob(db, "frequent", { send: async () => {}, ctx });
    expect(result).toMatchObject({ abandoned: 0 });
    expect(await runJob(db, "daily", { send: async () => {}, ctx })).toMatchObject({ bags: 0 });
  });

  it("limits count per subject inside a window, then reset", async () => {
    const tight = { name: "test", max: 3, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 5 }, () => allow(db, tight, "1.2.3.4", "secret")));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await allow(db, tight, "5.6.7.8", "secret")).toBe(true);
    await db.execute(sql`update request_limits set window_start = now() - interval '2 minutes'`);
    expect(await allow(db, tight, "1.2.3.4", "secret")).toBe(true);
    const keys = await db.execute(sql`select key from request_limits`);
    expect(JSON.stringify(keys.rows)).not.toContain("1.2.3.4");
    expect(LIMITS.checkoutPhone.max).toBeGreaterThan(1);
  });
});
