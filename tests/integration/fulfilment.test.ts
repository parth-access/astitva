import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { codCollections, emailOutbox, inventoryMovements, orderEvents, orders, refunds, shipments, storeSettings, users } from "../../src/db/schema";
import { addToBag, openBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import {
  markCodRemitted,
  markDelivered,
  markReturnedToOrigin,
  packOrder,
  resolveOrder,
  shipOrder,
  unpackOrder,
} from "../../src/modules/orders/fulfilment";
import { cancelOrder, OrderRuleError } from "../../src/modules/orders/service";
import { refundableMinor, RefundError, refundOrder } from "../../src/modules/payments/refunds";
import { confirmFromCheckout, handleWebhook, openPayment } from "../../src/modules/payments/service";
import { fakeRazorpay } from "./fake-razorpay";
import { createVariant, expireHolds, hasDb, makeDb, movementSum, onHand, resetData } from "./helpers";

const ship = { carrierName: "Delhivery", trackingNumber: "AWB123456", trackingUrl: "https://www.delhivery.com/track/package/AWB123456" };

function buyer(method: "cod" | "online", phone = "9812345678"): CheckoutInput {
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone, email: "asha@example.com" },
    address: { recipientName: "Asha Rao", phone, line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
    paymentMethod: method,
  };
}

async function rule(p: Promise<unknown>, Err: typeof OrderRuleError | typeof RefundError = OrderRuleError) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(Err);
  return (err as Error).message;
}

describe.skipIf(!hasDb)("after the order: packing, shipping, returns and refunds", () => {
  const db = makeDb(8);
  let admin: string;

  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;

  async function codOrder(units = 1) {
    const v = await createVariant(db, { onHand: units, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    return { v, ...(await placeOrder(db, bag.id, buyer("cod"))) };
  }

  async function paidOnlineOrder(fake: ReturnType<typeof fakeRazorpay>, units = 1) {
    const v = await createVariant(db, { onHand: units, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    const placed = await placeOrder(db, bag.id, buyer("online"));
    const session = await openPayment(db, fake.rzp, placed.orderId);
    const paid = fake.pay(session.razorpayOrderId);
    await confirmFromCheckout(db, fake.rzp, paid.reply);
    return { v, ...placed, payment: paid.payment, session };
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, codEnabled: true });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    admin = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("COD: pack straight away, ship, deliver, the courier pays over, then a refund in two parts", async () => {
    const { orderId } = await codOrder();

    await packOrder(db, orderId, admin);
    await unpackOrder(db, orderId, admin);
    expect(await rule(shipOrder(db, orderId, admin, { ...ship, trackingNumber: " " }))).toMatch(/tracking/);
    expect(await rule(shipOrder(db, orderId, admin, { ...ship, trackingUrl: "javascript:alert(1)" }))).toMatch(/https/);
    await shipOrder(db, orderId, admin, ship); // from confirmed: packs and ships
    expect((await orderRow(orderId)).orderStatus).toBe("shipped");
    const [s] = await db.select().from(shipments).where(eq(shipments.orderId, orderId));
    expect(s).toMatchObject({ carrierName: "Delhivery", trackingNumber: "AWB123456", status: "shipped" });
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.template, "order_shipped"))).length).toBe(1);
    expect(await rule(cancelOrder(db, orderId, admin, "changed mind"))).toMatch(/already left/);

    await markDelivered(db, orderId, admin);
    expect(await orderRow(orderId)).toMatchObject({ orderStatus: "delivered", paymentStatus: "unpaid" });
    expect((await db.select().from(codCollections).where(eq(codCollections.orderId, orderId)))[0]!.status).toBe("collected_by_courier");
    expect(await refundableMinor(db, orderId)).toBe(0);

    await markCodRemitted(db, orderId, admin, "Delhivery remittance 0423");
    expect((await orderRow(orderId)).paymentStatus).toBe("paid");
    expect(await refundableMinor(db, orderId)).toBe(349_900);

    // Krishna sends money back by UPI herself, in two parts.
    await refundOrder(db, null, orderId, admin, { amountMinor: 100_000, reason: "Loose button", method: "manual_upi", reference: "UPI 4242" });
    expect((await orderRow(orderId)).paymentStatus).toBe("partially_refunded");
    expect(await rule(refundOrder(db, null, orderId, admin, { amountMinor: 300_000, reason: "x", method: "manual_upi" }), RefundError)).toMatch(/At most ₹2,499/);
    await refundOrder(db, null, orderId, admin, { amountMinor: 249_900, reason: "Returned it", method: "manual_bank" });
    expect((await orderRow(orderId)).paymentStatus).toBe("refunded");
    expect(await refundableMinor(db, orderId)).toBe(0);
  });

  it("an online parcel the courier brings back: stock returns, refund through Razorpay clears the flag", async () => {
    const fake = fakeRazorpay();
    const { v, orderId, payment } = await paidOnlineOrder(fake, 1);
    expect(await onHand(db, v.id)).toBe(0);
    await shipOrder(db, orderId, admin, ship);

    expect(await rule(markReturnedToOrigin(db, orderId, admin, ""))).toMatch(/why/);
    await markReturnedToOrigin(db, orderId, admin, "Buyer unreachable");
    expect(await orderRow(orderId)).toMatchObject({ orderStatus: "returned", needsResolution: true });
    expect(await onHand(db, v.id)).toBe(1);
    expect(await movementSum(db, v.id)).toBe(1);
    const [back] = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.variantId, v.id), eq(inventoryMovements.movementType, "return_restock")));
    expect(back!.quantityDelta).toBe(1);
    expect((await db.select().from(shipments).where(eq(shipments.orderId, orderId)))[0]!.status).toBe("returned_to_origin");

    const result = await refundOrder(db, fake.rzp, orderId, admin, { amountMinor: 349_900, reason: "Came back undelivered", method: "razorpay" });
    expect(result.status).toBe("succeeded");
    expect(fake.refunds).toMatchObject([{ amount: 349_900, notes: { orderId, refundId: result.refundId } }]);
    expect(await orderRow(orderId)).toMatchObject({ paymentStatus: "refunded", needsResolution: false });
    const [r] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(r).toMatchObject({ method: "razorpay", status: "succeeded" });
    expect(r!.providerRefundId).toMatch(/^rfnd_/);
    expect(payment.id).toMatch(/^pay_/);
  });

  it("two clicks on refund can't refund twice; a pending refund is settled by the webhook, once", async () => {
    const fake = fakeRazorpay({ refundStatus: "pending" });
    const { orderId } = await paidOnlineOrder(fake, 2);
    const full = { amountMinor: 349_900, reason: "Changed her mind", method: "razorpay" as const };
    const results = await Promise.allSettled([refundOrder(db, fake.rzp, orderId, admin, full), refundOrder(db, fake.rzp, orderId, admin, full)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(fake.refunds).toHaveLength(1);
    expect((await orderRow(orderId)).paymentStatus).toBe("paid");

    const [r] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(r!.status).toBe("initiated");
    const hook = { event: "refund.processed", payload: { refund: { entity: { id: r!.providerRefundId!, payment_id: "pay", amount: 349_900, status: "processed", notes: {} } } } };
    expect(await handleWebhook(db, "evt_r1", hook as never)).toBe("processed");
    expect(await handleWebhook(db, "evt_r1", hook as never)).toBe("duplicate");
    expect(await handleWebhook(db, "evt_r2", hook as never)).toBe("processed"); // a second, different delivery of the same news
    expect((await orderRow(orderId)).paymentStatus).toBe("refunded");
    const events = await db.select().from(orderEvents).where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.eventType, "refund.succeeded")));
    expect(events).toHaveLength(1);
  });

  it("a refund Razorpay refuses is marked failed and can be tried again", async () => {
    const fake = fakeRazorpay();
    const { orderId } = await paidOnlineOrder(fake);
    fake.setDown(true);
    expect(await rule(refundOrder(db, fake.rzp, orderId, admin, { amountMinor: 349_900, reason: "x", method: "razorpay" }), RefundError)).toMatch(/refused/);
    expect((await db.select().from(refunds).where(eq(refunds.orderId, orderId)))[0]!.status).toBe("failed");
    fake.setDown(false);
    await refundOrder(db, fake.rzp, orderId, admin, { amountMinor: 349_900, reason: "x", method: "razorpay" });
    expect((await orderRow(orderId)).paymentStatus).toBe("refunded");
  });

  it("paid too late, refunded in full: the order is closed as cancelled", async () => {
    const fake = fakeRazorpay();
    const v = await createVariant(db, { onHand: 1, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    const placed = await placeOrder(db, bag.id, buyer("online"));
    const session = await openPayment(db, fake.rzp, placed.orderId);
    await expireHolds(db, placed.orderId);
    const other = await openBag(db, null);
    await addToBag(db, other.id, v.id);
    await placeOrder(db, other.id, buyer("cod", "9811111111"));
    await confirmFromCheckout(db, fake.rzp, fake.pay(session.razorpayOrderId).reply);
    expect(await orderRow(placed.orderId)).toMatchObject({ needsResolution: true, orderStatus: "pending_payment" });
    expect(await rule(packOrder(db, placed.orderId, admin))).toMatch(/flagged/);

    await refundOrder(db, fake.rzp, placed.orderId, admin, { amountMinor: 349_900, reason: "Sold out before payment", method: "razorpay" });
    expect(await orderRow(placed.orderId)).toMatchObject({ orderStatus: "cancelled", paymentStatus: "refunded", needsResolution: false });
  });

  it("resolving a flag needs a note", async () => {
    const fake = fakeRazorpay();
    const { orderId } = await paidOnlineOrder(fake);
    await cancelOrder(db, orderId, admin, "Buyer asked");
    expect((await orderRow(orderId)).needsResolution).toBe(true);
    expect(await rule(resolveOrder(db, orderId, admin, " "))).toMatch(/Note/);
    await resolveOrder(db, orderId, admin, "Swapped for Ink M by WhatsApp");
    expect((await orderRow(orderId)).needsResolution).toBe(false);
  });
});
