import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { emailOutbox, inventoryReservations, orderEvents, orders, paymentEvents, payments, storeSettings } from "../../src/db/schema";
import { addToBag, openBag, readBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import { createRazorpay, hmacHex, type RazorpayPayment } from "../../src/modules/payments/razorpay";
import { confirmFromCheckout, handleWebhook, openPayment, PaymentError } from "../../src/modules/payments/service";
import { createVariant, expireHolds, hasDb, makeDb, movementSum, onHand, resetData } from "./helpers";

const SECRET = "test_secret_value";

/** Stands in for Razorpay's API: remembers orders, and payments we tell it about. */
function fakeRazorpay() {
  const orderAmounts = new Map<string, number>();
  const paymentsById = new Map<string, RazorpayPayment>();
  let down = false;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (down) return new Response(JSON.stringify({ error: { description: "Service unavailable" } }), { status: 503 });
    const path = new URL(String(url)).pathname.replace("/v1", "");
    if (init?.method === "POST" && path === "/orders") {
      const body = JSON.parse(String(init.body)) as { amount: number; receipt: string };
      const id = `order_${randomUUID().slice(0, 14)}`;
      orderAmounts.set(id, body.amount);
      return Response.json({ id, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created" });
    }
    const capture = /^\/payments\/([^/]+)\/capture$/.exec(path);
    if (capture) {
      const p = paymentsById.get(capture[1]!)!;
      p.status = "captured";
      return Response.json(p);
    }
    const fetchP = /^\/payments\/([^/]+)$/.exec(path);
    if (fetchP && paymentsById.has(fetchP[1]!)) return Response.json(paymentsById.get(fetchP[1]!));
    return new Response(JSON.stringify({ error: { description: "Not found" } }), { status: 404 });
  }) as typeof fetch;

  return {
    rzp: createRazorpay({ keyId: "rzp_test_abc", keySecret: SECRET }, fetchImpl),
    setDown: (v: boolean) => (down = v),
    /** The buyer pays in Razorpay's window. Returns what the browser would send back. */
    pay(razorpayOrderId: string, opts: { amount?: number; status?: string } = {}) {
      const id = `pay_${randomUUID().slice(0, 14)}`;
      const payment: RazorpayPayment = {
        id,
        order_id: razorpayOrderId,
        amount: opts.amount ?? orderAmounts.get(razorpayOrderId)!,
        currency: "INR",
        status: opts.status ?? "captured",
        method: "upi",
      };
      paymentsById.set(id, payment);
      return { payment, reply: { razorpayOrderId, razorpayPaymentId: id, signature: hmacHex(SECRET, `${razorpayOrderId}|${id}`) } };
    },
  };
}

function buyer(key = randomUUID()): CheckoutInput {
  return {
    idempotencyKey: key,
    contact: { name: "Asha Rao", phone: "9812345678", email: "asha@example.com" },
    address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
    paymentMethod: "online",
  };
}

describe.skipIf(!hasDb)("online payment", () => {
  const db = makeDb(8);

  async function checkout(onHandUnits = 1, quantity = 1) {
    const v = await createVariant(db, { onHand: onHandUnits, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id, quantity);
    const placed = await placeOrder(db, bag.id, buyer());
    return { v, bagId: bag.id, placed };
  }
  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, codEnabled: true, reservationTtlMinutes: 15 });
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("holds stock while waiting, and keeps the bag", async () => {
    const { v, bagId, placed } = await checkout(2);
    expect(placed).toMatchObject({ paymentMethod: "online", orderStatus: "pending_payment", totalMinor: 349_900 });
    expect(await onHand(db, v.id)).toBe(2);
    const [hold] = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, placed.orderId));
    expect(hold).toMatchObject({ status: "active", quantity: 1 });
    expect((await readBag(db, bagId)).lines[0]).toMatchObject({ quantity: 1, available: 1 });
  });

  it("is paid only once Razorpay says so: signature, amount, then stock becomes a sale", async () => {
    const fake = fakeRazorpay();
    const { v, bagId, placed } = await checkout(1);
    const session = await openPayment(db, fake.rzp, placed.orderId);
    expect(session).toMatchObject({ keyId: "rzp_test_abc", testMode: true, amountMinor: 349_900, orderNumber: placed.orderNumber });
    // Opening again (window closed and reopened) reuses the same Razorpay order.
    expect((await openPayment(db, fake.rzp, placed.orderId)).razorpayOrderId).toBe(session.razorpayOrderId);

    const { reply } = fake.pay(session.razorpayOrderId);
    await expect(confirmFromCheckout(db, fake.rzp, { ...reply, signature: "0".repeat(64) })).rejects.toMatchObject({ code: "bad_signature" });
    expect((await orderRow(placed.orderId)).paymentStatus).toBe("unpaid");

    expect(await confirmFromCheckout(db, fake.rzp, reply)).toMatchObject({ outcome: "paid" });
    expect(await orderRow(placed.orderId)).toMatchObject({ orderStatus: "confirmed", paymentStatus: "paid", needsResolution: false });
    expect(await onHand(db, v.id)).toBe(0);
    expect(await movementSum(db, v.id)).toBe(0);
    const [p] = await db.select().from(payments).where(eq(payments.orderId, placed.orderId));
    expect(p).toMatchObject({ status: "captured", providerPaymentId: reply.razorpayPaymentId });
    expect((await readBag(db, bagId)).count).toBe(0);
    expect(await db.select().from(emailOutbox)).toHaveLength(1);

    // The browser reporting again changes nothing.
    expect(await confirmFromCheckout(db, fake.rzp, reply)).toMatchObject({ outcome: "already_paid" });
    expect(await onHand(db, v.id)).toBe(0);
  });

  it("refuses a payment for the wrong amount, and captures an authorised one", async () => {
    const fake = fakeRazorpay();
    const { placed } = await checkout(2);
    const session = await openPayment(db, fake.rzp, placed.orderId);
    const short = fake.pay(session.razorpayOrderId, { amount: 100 });
    await expect(confirmFromCheckout(db, fake.rzp, short.reply)).rejects.toMatchObject({ code: "mismatch" });
    expect((await orderRow(placed.orderId)).paymentStatus).toBe("unpaid");

    const authorised = fake.pay(session.razorpayOrderId, { status: "authorized" });
    expect(await confirmFromCheckout(db, fake.rzp, authorised.reply)).toMatchObject({ outcome: "paid" });
  });

  it("browser and webhook racing end in one sale; webhook repeats are skipped", async () => {
    const fake = fakeRazorpay();
    const { v, placed } = await checkout(1);
    const session = await openPayment(db, fake.rzp, placed.orderId);
    const { payment, reply } = fake.pay(session.razorpayOrderId);
    const hook = { event: "payment.captured", payload: { payment: { entity: payment } } };

    const results = await Promise.all([confirmFromCheckout(db, fake.rzp, reply), handleWebhook(db, "evt_1", hook)]);
    expect(results[1]).toBe("processed");
    expect(await handleWebhook(db, "evt_1", hook)).toBe("duplicate");
    expect(await onHand(db, v.id)).toBe(0);
    expect(await movementSum(db, v.id)).toBe(0);
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, placed.orderId));
    expect(events.filter((e) => e.eventType === "payment.captured")).toHaveLength(1);
    expect(await db.select().from(paymentEvents)).toHaveLength(1);
  });

  it("a payment that arrives after the stock went elsewhere is kept and flagged for a refund", async () => {
    const fake = fakeRazorpay();
    const { v, placed } = await checkout(1);
    const session = await openPayment(db, fake.rzp, placed.orderId);
    await expireHolds(db, placed.orderId);

    // Someone else buys the last one by cash on delivery while this buyer is still paying.
    const other = await openBag(db, null);
    await addToBag(db, other.id, v.id);
    await placeOrder(db, other.id, { ...buyer(), paymentMethod: "cod", contact: { name: "Meera", phone: "9811111111", email: null } });

    const { reply } = fake.pay(session.razorpayOrderId);
    expect(await confirmFromCheckout(db, fake.rzp, reply)).toMatchObject({ outcome: "needs_resolution" });
    expect(await orderRow(placed.orderId)).toMatchObject({ orderStatus: "pending_payment", paymentStatus: "paid", needsResolution: true });
    expect(await onHand(db, v.id)).toBe(0);
  });

  it("checking out again from the same bag cancels the unpaid order and its hold", async () => {
    const { v, bagId, placed } = await checkout(1);
    const again = await placeOrder(db, bagId, buyer());
    expect(again.orderId).not.toBe(placed.orderId);
    expect((await orderRow(placed.orderId)).orderStatus).toBe("cancelled");
    expect(await onHand(db, v.id)).toBe(1);
  });

  it("if Razorpay is down, the order is cancelled and the stock freed", async () => {
    const fake = fakeRazorpay();
    fake.setDown(true);
    const { placed } = await checkout(1);
    const err = await openPayment(db, fake.rzp, placed.orderId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((await orderRow(placed.orderId)).orderStatus).toBe("cancelled");
    const [hold] = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, placed.orderId));
    expect(hold!.status).toBe("released");
  });
});
