import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { emailOutbox, inventoryReservations, orderEvents, orders, paymentEvents, payments, storeSettings } from "../../src/db/schema";
import { addToBag, openBag, readBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import { confirmFromCheckout, handleWebhook, openPayment, PaymentError } from "../../src/modules/payments/service";
import { fakeRazorpay } from "./fake-razorpay";
import { createVariant, expireHolds, hasDb, makeDb, movementSum, onHand, resetData } from "./helpers";

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

  it("Pay now after the hold lapsed takes the stock again if it's free, and closes the order if it sold", async () => {
    const fake = fakeRazorpay();
    const { v, placed } = await checkout(1);
    await openPayment(db, fake.rzp, placed.orderId);
    await expireHolds(db, placed.orderId);

    // Still free: held again, for a fresh reservation period, and the payment goes through.
    const session = await openPayment(db, fake.rzp, placed.orderId);
    const live = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, placed.orderId));
    expect(live.filter((r) => r.status === "active")).toHaveLength(1);
    expect(live.find((r) => r.status === "active")!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await confirmFromCheckout(db, fake.rzp, fake.pay(session.razorpayOrderId).reply)).toMatchObject({ outcome: "paid" });
    expect(await onHand(db, v.id)).toBe(0);

    // Sold to someone else meanwhile: closed, nothing to pay, nothing held.
    const second = await checkout(1);
    await openPayment(db, fake.rzp, second.placed.orderId);
    await expireHolds(db, second.placed.orderId);
    const other = await openBag(db, null);
    await addToBag(db, other.id, second.v.id);
    await placeOrder(db, other.id, { ...buyer(), paymentMethod: "cod", contact: { name: "Meera", phone: "9811111111", email: null } });
    await expect(openPayment(db, fake.rzp, second.placed.orderId)).rejects.toMatchObject({ code: "sold_out" });
    expect(await orderRow(second.placed.orderId)).toMatchObject({ orderStatus: "cancelled", paymentStatus: "unpaid" });
    const holds = await db.select().from(inventoryReservations).where(eq(inventoryReservations.orderId, second.placed.orderId));
    expect(holds.some((r) => r.status === "active")).toBe(false);
  });

  it("two Pay now taps at once open one Razorpay order", async () => {
    const fake = fakeRazorpay();
    const { placed } = await checkout(1);
    const [a, b] = await Promise.all([openPayment(db, fake.rzp, placed.orderId), openPayment(db, fake.rzp, placed.orderId)]);
    expect(a.razorpayOrderId).toBe(b.razorpayOrderId);
    expect(await db.select().from(payments).where(eq(payments.orderId, placed.orderId))).toHaveLength(1);
  });

  it("a second payment for an order already paid is flagged for a refund, once, instead of failing", async () => {
    const fake = fakeRazorpay();
    const { v, placed } = await checkout(2);
    const session = await openPayment(db, fake.rzp, placed.orderId);
    expect(await confirmFromCheckout(db, fake.rzp, fake.pay(session.razorpayOrderId).reply)).toMatchObject({ outcome: "paid" });

    // A second payment on the same Razorpay order, reported by the webhook twice.
    const extra = fake.pay(session.razorpayOrderId);
    const hook = { event: "payment.captured", payload: { payment: { entity: extra.payment } } };
    expect(await handleWebhook(db, "evt_extra_1", hook)).toBe("processed");
    expect(await handleWebhook(db, "evt_extra_2", hook)).toBe("processed");
    expect(await confirmFromCheckout(db, fake.rzp, extra.reply)).toMatchObject({ outcome: "needs_resolution" });

    const order = await orderRow(placed.orderId);
    expect(order).toMatchObject({ orderStatus: "confirmed", paymentStatus: "paid", needsResolution: true });
    expect(order.resolutionNote).toContain(extra.payment.id);
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, placed.orderId));
    expect(events.filter((e) => e.eventType === "payment.extra")).toHaveLength(1);
    expect(await onHand(db, v.id)).toBe(1);
  });
});
