/**
 * Online payment through Razorpay (Standard Checkout).
 *
 *   1. checkout places the order "pending_payment" with stock held
 *   2. openPayment creates a Razorpay order for its total (server-side amount)
 *   3. the buyer pays in Razorpay's window; the browser sends back ids and a signature
 *   4. confirmPayment checks the signature, then asks Razorpay itself what was
 *      paid, and only then marks the order paid and turns the hold into a sale
 *   5. the webhook does step 4 too, so a closed tab still ends in a paid order
 *
 * Steps 4 and 5 race and either may come first; both end in the same state
 * exactly once (the order row is locked, transitions go through the machines,
 * and committing stock is idempotent).
 *
 * If the hold lapsed and the stock went to someone else before the money
 * arrived, the payment is still recorded, the order is flagged
 * needs_resolution and Krishna refunds it (refunds arrive in M5).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "@/db/create";
import { cartItems, orderEvents, orderItems, orders, paymentEvents, payments } from "@/db/schema";
import { commitOrderReservations, releaseOrderHolds } from "@/modules/inventory/service";
import { queueOrderPlacedEmails } from "@/modules/checkout/service";
import { releaseCodeUse } from "@/modules/discounts/service";
import { issueReceipt } from "@/modules/receipts/service";
import { alertOwners } from "@/modules/email/outbox";
import { orderMachine, orderPaymentMachine, paymentAttemptMachine } from "@/modules/orders/machines";
import type { Razorpay, RazorpayPayment, RazorpayRefund } from "./razorpay";
import { refundUpdateFromRazorpay } from "./refunds";

export type PaymentErrorCode = "not_found" | "not_payable" | "bad_signature" | "mismatch" | "not_paid" | "provider";

export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/** What the browser needs to open Razorpay's window. Nothing secret. */
export type CheckoutSession = {
  keyId: string;
  testMode: boolean;
  razorpayOrderId: string;
  amountMinor: number;
  orderId: string;
  orderNumber: string;
  prefill: { name: string; email: string | null; contact: string };
};

/**
 * The Razorpay order for an unpaid order: the existing one if any (so paying
 * again after closing the window reuses it), otherwise a new one for the
 * order's total as stored. If Razorpay can't be reached the order is cancelled
 * and its stock released, so nothing stays held for a payment that can't happen.
 */
export async function openPayment(db: Db, rzp: Razorpay, orderId: string): Promise<CheckoutSession> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new PaymentError("not_found", "No such order.");
  if (order.paymentMethod !== "online" || order.orderStatus !== "pending_payment" || order.paymentStatus !== "unpaid") {
    throw new PaymentError("not_payable", "This order isn't waiting for an online payment.");
  }
  const session = (razorpayOrderId: string): CheckoutSession => ({
    keyId: rzp.keyId,
    testMode: rzp.testMode,
    razorpayOrderId,
    amountMinor: Number(order.totalMinor),
    orderId: order.id,
    orderNumber: order.orderNumber,
    prefill: { name: order.contactName, email: order.contactEmail, contact: `+91${order.contactPhone}` },
  });

  const [open] = await db
    .select({ providerOrderId: payments.providerOrderId })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "created")))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (open) return session(open.providerOrderId);

  let created;
  try {
    created = await rzp.createOrder({ amountMinor: Number(order.totalMinor), receipt: order.orderNumber, notes: { orderId: order.id } });
  } catch (err) {
    await abandonOrder(db, orderId, "Payment could not be started");
    throw new PaymentError("provider", `Razorpay is unavailable: ${(err as Error).message}`);
  }
  if (created.amount !== Number(order.totalMinor)) throw new PaymentError("mismatch", "Razorpay recorded a different amount.");
  await db
    .insert(payments)
    .values({ orderId, providerOrderId: created.id, amountMinor: Number(order.totalMinor) })
    .onConflictDoNothing();
  return session(created.id);
}

/** Cancel an unpaid order and drop its holds. A payment that still arrives later is flagged for a refund. */
export async function abandonOrder(db: Db, orderId: string, reason: string) {
  await db.transaction(async (tx) => {
    const [o] = await tx.select({ status: orders.orderStatus, paid: orders.paymentStatus }).from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || o.paid !== "unpaid" || !orderMachine.can(o.status, "cancelled")) return;
    await tx.update(orders).set({ orderStatus: "cancelled", cancelReason: reason }).where(eq(orders.id, orderId));
    await releaseOrderHolds(tx, orderId);
    await releaseCodeUse(tx, orderId);
    await tx.insert(orderEvents).values({ orderId, eventType: "order.cancelled", fromStatus: o.status, toStatus: "cancelled", actorType: "system", metadata: { reason } });
  });
}

export type ConfirmOutcome =
  | { outcome: "paid"; orderId: string; orderNumber: string }
  | { outcome: "already_paid"; orderId: string; orderNumber: string }
  /** Money received but the stock is gone (or the order was cancelled): Krishna refunds. */
  | { outcome: "needs_resolution"; orderId: string; orderNumber: string };

/**
 * The browser's report after Razorpay's window closes successfully. The
 * signature proves the ids came from Razorpay; the payment is then fetched
 * from Razorpay to learn its real amount and status.
 */
export async function confirmFromCheckout(
  db: Db,
  rzp: Razorpay,
  input: { razorpayOrderId: string; razorpayPaymentId: string; signature: string },
): Promise<ConfirmOutcome> {
  if (!rzp.isCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.signature)) {
    throw new PaymentError("bad_signature", "The payment reply wasn't signed by Razorpay.");
  }
  let payment = await rzp.fetchPayment(input.razorpayPaymentId);
  // Accounts with manual capture leave payments "authorized"; capture them here.
  if (payment.status === "authorized") payment = await rzp.capturePayment(payment.id, payment.amount);
  return recordCapture(db, payment, "browser");
}

/**
 * Mark the order paid for a captured Razorpay payment, exactly once.
 * Called from the browser path and from the webhook (payment.captured).
 */
export async function recordCapture(db: Db, payment: RazorpayPayment, source: "browser" | "webhook"): Promise<ConfirmOutcome> {
  if (payment.status !== "captured") throw new PaymentError("not_paid", `Payment is ${payment.status}, not captured.`);
  if (!payment.order_id) throw new PaymentError("mismatch", "Payment has no Razorpay order.");

  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(payments).where(eq(payments.providerOrderId, payment.order_id!)).for("update");
    if (!attempt) throw new PaymentError("not_found", `No order for Razorpay order ${payment.order_id}.`);
    if (payment.amount !== Number(attempt.amountMinor) || payment.currency !== "INR") {
      throw new PaymentError("mismatch", `Paid ${payment.amount} ${payment.currency}, expected ${attempt.amountMinor} INR.`);
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for("update");
    const ref = { orderId: order!.id, orderNumber: order!.orderNumber };

    if (attempt.status === "captured") {
      return { outcome: order!.needsResolution ? "needs_resolution" : "already_paid", ...ref } as ConfirmOutcome;
    }
    paymentAttemptMachine.assertTransition(attempt.status, "captured");
    await tx
      .update(payments)
      .set({ status: "captured", providerPaymentId: payment.id, capturedAt: new Date(), failureReason: null })
      .where(eq(payments.id, attempt.id));

    orderPaymentMachine.assertTransition(order!.paymentStatus, "paid");
    await tx.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, order!.id));
    // Money received: it gets a receipt, whatever happens to the order next.
    await issueReceipt(tx, order!.id, { paidWith: payment.method ?? null, providerPaymentId: payment.id, paidAt: new Date() });
    await tx.insert(orderEvents).values({
      orderId: order!.id,
      eventType: "payment.captured",
      actorType: source === "webhook" ? "system" : "customer",
      metadata: { razorpayPaymentId: payment.id, amountMinor: payment.amount, method: payment.method ?? null, source },
    });

    // Paid for an order that was cancelled meanwhile (checkout restarted, or Razorpay was down): refund.
    if (order!.orderStatus !== "pending_payment") {
      await flag(tx, order!.id, `Paid ${payment.id} after the order was ${order!.orderStatus}. Refund the buyer, or reopen with Krishna.`);
      return { outcome: "needs_resolution", ...ref };
    }

    const commit = await commitOrderReservations(tx, order!.id);
    if (commit.outcome === "stock_unavailable") {
      await flag(tx, order!.id, `Paid ${payment.id} but the stock went to someone else before payment arrived. Refund the buyer.`);
      return { outcome: "needs_resolution", ...ref };
    }

    orderMachine.assertTransition(order!.orderStatus, "confirmed");
    await tx.update(orders).set({ orderStatus: "confirmed" }).where(eq(orders.id, order!.id));
    await tx.insert(orderEvents).values({ orderId: order!.id, eventType: "order.placed", fromStatus: "pending_payment", toStatus: "confirmed", actorType: "system" });
    await queueOrderPlacedEmails(tx, order!.id, order!.orderNumber, order!.contactEmail);
    await emptyBagOf(tx, order!.id, order!.idempotencyScope);
    return { outcome: "paid", ...ref };
  });
}

async function flag(tx: Tx, orderId: string, note: string) {
  await tx.update(orders).set({ needsResolution: true, resolutionNote: note }).where(eq(orders.id, orderId));
  await tx.insert(orderEvents).values({ orderId, eventType: "order.needs_resolution", actorType: "system", metadata: { note } });
  await alertOwners(tx, "owner_needs_you", `${orderId}:${Date.now()}`, { orderId });
}

/** Take the paid pieces out of the bag the order came from (the scope is the bag's id). */
async function emptyBagOf(tx: Tx, orderId: string, bagId: string) {
  const variantIds = (await tx.select({ id: orderItems.variantId }).from(orderItems).where(eq(orderItems.orderId, orderId)))
    .map((r) => r.id)
    .filter((id): id is string => id !== null);
  if (variantIds.length === 0 || !/^[0-9a-f-]{36}$/.test(bagId)) return;
  await tx.delete(cartItems).where(and(eq(cartItems.cartId, bagId), inArray(cartItems.variantId, variantIds)));
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

type WebhookPayload = {
  event: string;
  payload?: { payment?: { entity?: RazorpayPayment }; refund?: { entity?: RazorpayRefund } };
};

export type WebhookResult = "processed" | "duplicate" | "ignored";

/**
 * A signed webhook (the route checks the signature). Each event is recorded
 * once by Razorpay's event id; a repeat delivery is acknowledged and skipped.
 * The summary keeps ids, amounts and status only, never contact or card data.
 */
export async function handleWebhook(db: Db, eventId: string, body: WebhookPayload): Promise<WebhookResult> {
  const p = body.payload?.payment?.entity;
  const r = body.payload?.refund?.entity;
  const summary = {
    ...(p ? { paymentId: p.id, orderId: p.order_id, amount: p.amount, currency: p.currency, status: p.status, method: p.method ?? null } : {}),
    ...(r ? { refundId: r.id, refundPaymentId: r.payment_id, refundAmount: r.amount, refundStatus: r.status } : {}),
  };
  const [attempt] = p?.order_id ? await db.select({ id: payments.id }).from(payments).where(eq(payments.providerOrderId, p.order_id)) : [];

  const [inserted] = await db
    .insert(paymentEvents)
    .values({ providerEventId: eventId, eventType: body.event.slice(0, 64), paymentId: attempt?.id ?? null, summary })
    .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] })
    .returning({ id: paymentEvents.id });
  let row = inserted;
  if (!row) {
    // Seen before. Done cleanly: acknowledge. Failed last time: Razorpay is retrying, so try again.
    const [seen] = await db
      .select({ id: paymentEvents.id, processedAt: paymentEvents.processedAt, error: paymentEvents.processingError })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.provider, "razorpay"), eq(paymentEvents.providerEventId, eventId)));
    if (!seen || (seen.processedAt && !seen.error)) return "duplicate";
    row = { id: seen.id };
  }

  try {
    if (r && (body.event === "refund.processed" || body.event === "refund.failed")) {
      const known = await refundUpdateFromRazorpay(db, r);
      await markEvent(db, row.id, null);
      return known ? "processed" : "ignored";
    }
    if (!p || !attempt) {
      await markEvent(db, row.id, null);
      return "ignored";
    }
    if (body.event === "payment.captured" || (body.event === "order.paid" && p.status === "captured")) {
      await recordCapture(db, p, "webhook");
    } else if (body.event === "payment.failed") {
      // The buyer can try again in the same window, so the attempt stays open; just note why.
      await db
        .update(payments)
        .set({ failureReason: (p.error_description ?? "Payment failed").slice(0, 500) })
        .where(and(eq(payments.id, attempt.id), eq(payments.status, "created")));
    } else {
      await markEvent(db, row.id, null);
      return "ignored";
    }
    await markEvent(db, row.id, null);
    return "processed";
  } catch (err) {
    await markEvent(db, row.id, (err as Error).message.slice(0, 1000));
    throw err;
  }
}

async function markEvent(db: DbOrTx, id: string, error: string | null) {
  await db.update(paymentEvents).set({ processedAt: new Date(), processingError: error }).where(eq(paymentEvents.id, id));
}
