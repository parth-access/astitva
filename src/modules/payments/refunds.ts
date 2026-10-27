/**
 * Giving money back.
 *
 * - Razorpay: back to the card or UPI it came from. The refund row is written
 *   first (under the order lock, so two clicks can't refund twice), then
 *   Razorpay is asked; its answer, or later the refund.processed webhook,
 *   marks it succeeded.
 * - Manual (UPI or bank transfer): Krishna has already sent the money herself,
 *   typically to a COD buyer; it is recorded as succeeded at once.
 *
 * Never more than was received: the amounts of refunds not failed are counted
 * against what was paid. The order's payment status follows: partially
 * refunded, then refunded. A fully refunded order that never went ahead (paid
 * too late) is cancelled and its flag cleared.
 */
import { and, asc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/create";
import { auditLogs, orderEvents, orders, payments, refunds } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { alertOwners, queueEmail } from "@/modules/email/outbox";
import { orderMachine, orderPaymentMachine, refundMachine } from "@/modules/orders/machines";
import { RazorpayError, type Razorpay, type RazorpayRefund } from "./razorpay";

export type RefundMethod = "razorpay" | "manual_upi" | "manual_bank";

export class RefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundError";
  }
}

type Order = typeof orders.$inferSelect;

/** What came in for this order, and what has gone (or is going) back. */
async function balance(tx: Tx, order: Order) {
  const [captured] = await tx
    .select({ id: payments.id, providerPaymentId: payments.providerPaymentId, amount: payments.amountMinor })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "captured")))
    .orderBy(asc(payments.capturedAt))
    .limit(1);
  // A COD order counts as received once the courier has remitted the cash (payment status "paid").
  const received = captured ? Number(captured.amount) : order.paymentStatus === "unpaid" ? 0 : Number(order.totalMinor);
  const [{ out }] = (await tx
    .select({ out: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::bigint` })
    .from(refunds)
    .where(and(eq(refunds.orderId, order.id), ne(refunds.status, "failed")))) as [{ out: number }];
  return { received, refunded: Number(out), captured: captured ?? null };
}

/** How much can still be refunded (for the admin form). */
export async function refundableMinor(db: Db, orderId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
    if (!order || order.paymentStatus === "unpaid" || order.paymentStatus === "refunded") return 0;
    const b = await balance(tx, order);
    return Math.max(0, b.received - b.refunded);
  });
}

export async function refundOrder(
  db: Db,
  rzp: Razorpay | null,
  orderId: string,
  actorId: string,
  input: { amountMinor: number; reason: string; method: RefundMethod; reference?: string | null },
): Promise<{ refundId: string; status: "succeeded" | "initiated" }> {
  const reason = input.reason.trim();
  if (!reason) throw new RefundError("Say why, for the buyer and the books.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new RefundError("Enter an amount above ₹0.");
  if (input.method === "razorpay" && !rzp) throw new RefundError("Razorpay isn't set up here; refund by UPI or bank and record it.");
  const reference = input.reference?.trim().slice(0, 80) || null;

  const pending = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new RefundError("That order doesn't exist.");
    if (order.paymentStatus === "unpaid") throw new RefundError("Nothing has been paid on this order.");
    const b = await balance(tx, order);
    const left = b.received - b.refunded;
    if (input.amountMinor > left) throw new RefundError(left > 0 ? `At most ${formatINR(left)} is left to refund.` : "It has all been refunded.");
    if (input.method === "razorpay" && !b.captured?.providerPaymentId) throw new RefundError("There's no Razorpay payment on this order; refund by UPI or bank.");

    const [row] = await tx
      .insert(refunds)
      .values({
        orderId,
        paymentId: input.method === "razorpay" ? b.captured!.id : null,
        method: input.method,
        amountMinor: input.amountMinor,
        status: input.method === "razorpay" ? "initiated" : "succeeded",
        reason: reference ? `${reason} (ref ${reference})` : reason,
        initiatedBy: actorId,
      })
      .returning({ id: refunds.id });
    await tx.insert(auditLogs).values({
      actorId,
      action: "order.refund_started",
      resourceType: "order",
      resourceId: orderId,
      metadata: { refundId: row!.id, amountMinor: input.amountMinor, method: input.method },
    });
    if (input.method !== "razorpay") await settle(tx, row!.id, actorId);
    return { refundId: row!.id, providerPaymentId: b.captured?.providerPaymentId ?? null };
  });

  if (input.method !== "razorpay") return { refundId: pending.refundId, status: "succeeded" };

  let result;
  try {
    result = await rzp!.refundPayment(pending.providerPaymentId!, input.amountMinor, { orderId, refundId: pending.refundId });
  } catch (err) {
    // Only a clear "no" (4xx) means no money moved. A timeout or a 5xx may have
    // refunded all the same, so the refund stays pending (and counts against
    // what can be refunded) until Razorpay says what happened: its webhook, or
    // the scheduled check (reconcileRefunds). Marking it failed here would let
    // a second click pay the buyer twice.
    if (isRefusal(err)) {
      await markRefundFailed(db, pending.refundId, (err as Error).message);
      throw new RefundError(`Razorpay refused the refund: ${(err as Error).message}`);
    }
    throw new RefundError(
      "Razorpay didn't answer in time, so the refund may still have gone through. It shows as pending and updates by itself within the hour. Don't refund again; check Razorpay's dashboard if you need to know now.",
    );
  }
  await db.update(refunds).set({ providerRefundId: result.id }).where(eq(refunds.id, pending.refundId));
  if (result.status === "processed") {
    await db.transaction((tx) => settle(tx, pending.refundId, actorId));
    return { refundId: pending.refundId, status: "succeeded" };
  }
  if (result.status === "failed") {
    await markRefundFailed(db, pending.refundId, "Razorpay marked it failed");
    throw new RefundError("Razorpay couldn't process the refund.");
  }
  return { refundId: pending.refundId, status: "initiated" };
}

/**
 * A refund went through: move the order's payment status on. Idempotent (the
 * webhook and Razorpay's immediate reply may both report it).
 */
async function settle(tx: Tx, refundId: string, actorId: string | null) {
  const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
  if (!refund) return;
  const [order] = await tx.select().from(orders).where(eq(orders.id, refund.orderId)).for("update");
  if (refund.status === "initiated" || refund.status === "failed") {
    refundMachine.assertTransition(refund.status, "succeeded");
    await tx.update(refunds).set({ status: "succeeded" }).where(eq(refunds.id, refundId));
    // We had given up on it, so it may have been refunded again since: worth a look.
    if (refund.status === "failed") await alertOwners(tx, "owner_needs_you", `refund_revived:${refundId}`, { orderId: refund.orderId });
  }

  const [{ done }] = (await tx
    .select({ done: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::bigint` })
    .from(refunds)
    .where(and(eq(refunds.orderId, order!.id), eq(refunds.status, "succeeded")))) as [{ done: number }];
  const b = await balance(tx, order!);
  const full = Number(done) >= b.received;
  const next = full ? "refunded" : "partially_refunded";
  if (order!.paymentStatus !== next) {
    orderPaymentMachine.assertTransition(order!.paymentStatus, next);
    await tx.update(orders).set({ paymentStatus: next }).where(eq(orders.id, order!.id));
  }
  const already = await tx
    .select({ id: orderEvents.id })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, order!.id), eq(orderEvents.eventType, "refund.succeeded"), sql`${orderEvents.metadata}->>'refundId' = ${refundId}`));
  if (already.length === 0) {
    await tx.insert(orderEvents).values({
      orderId: order!.id,
      eventType: "refund.succeeded",
      actorType: actorId ? "admin" : "system",
      actorId,
      metadata: { refundId, amountMinor: Number(refund.amountMinor), method: refund.method },
    });
    if (order!.contactEmail) {
      await queueEmail(tx, { dedupeKey: `refund_succeeded:${refundId}`, template: "refund_succeeded", to: order!.contactEmail, payload: { orderId: order!.id, refundId } });
    }
  }

  if (full) {
    // Paid too late and now refunded in full: the order never went ahead.
    if (order!.orderStatus === "pending_payment" && orderMachine.can(order!.orderStatus, "cancelled")) {
      await tx.update(orders).set({ orderStatus: "cancelled", cancelReason: order!.cancelReason ?? "Refunded: the pieces had sold" }).where(eq(orders.id, order!.id));
      await tx.insert(orderEvents).values({ orderId: order!.id, eventType: "order.cancelled", fromStatus: "pending_payment", toStatus: "cancelled", actorType: "system" });
    }
    if (order!.needsResolution) {
      await tx
        .update(orders)
        .set({ needsResolution: false, resolutionNote: `${order!.resolutionNote ?? ""}\nResolved: refunded in full.`.trim() })
        .where(eq(orders.id, order!.id));
    }
  }
}

async function markRefundFailed(db: Db, refundId: string, why: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (!r || !refundMachine.can(r.status, "failed")) return;
    await tx.update(refunds).set({ status: "failed" }).where(eq(refunds.id, refundId));
    await tx.insert(orderEvents).values({ orderId: r.orderId, eventType: "refund.failed", actorType: "system", metadata: { refundId, why: why.slice(0, 300) } });
  });
}

/** From the webhook: refund.processed / refund.failed. Finds the row by Razorpay's id, or by our id in its notes. */
export async function refundUpdateFromRazorpay(db: Db, entity: { id: string; status: string; notes?: unknown }): Promise<boolean> {
  const notes = entity.notes && !Array.isArray(entity.notes) ? (entity.notes as Record<string, string>) : {};
  const [row] = await db
    .select({ id: refunds.id, providerRefundId: refunds.providerRefundId })
    .from(refunds)
    .where(sql`${refunds.providerRefundId} = ${entity.id} or ${refunds.id}::text = ${notes.refundId ?? ""}`)
    .limit(1);
  if (!row) return false;
  if (!row.providerRefundId) await db.update(refunds).set({ providerRefundId: entity.id }).where(eq(refunds.id, row.id));
  if (entity.status === "processed") await db.transaction((tx) => settle(tx, row.id, null));
  else if (entity.status === "failed") await markRefundFailed(db, row.id, "Razorpay reported the refund failed");
  return true;
}

/** Razorpay said no (a 4xx): nothing was refunded. Anything else (a timeout, a 5xx) is unknown. */
function isRefusal(err: unknown): boolean {
  return err instanceof RazorpayError && err.status !== undefined && err.status >= 400 && err.status < 500;
}

/** A refund we heard nothing back about is looked up after this long; not found, it never happened. */
export const RECONCILE_AFTER_MINUTES = 10;

/**
 * Scheduled: Razorpay refunds still pending. One whose request got no answer
 * is looked for among the payment's refunds (by our id in its notes); one
 * Razorpay has but whose webhook never came is fetched. Either is then
 * settled or failed. Returns how many changed.
 */
export async function reconcileRefunds(db: Db, rzp: Razorpay): Promise<number> {
  const stuck = await db
    .select({ id: refunds.id, providerRefundId: refunds.providerRefundId, paymentId: payments.providerPaymentId })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(
      and(
        eq(refunds.method, "razorpay"),
        eq(refunds.status, "initiated"),
        lt(refunds.createdAt, sql`now() - make_interval(mins => ${RECONCILE_AFTER_MINUTES})`),
      ),
    )
    .limit(20);
  let changed = 0;
  for (const r of stuck) {
    let found: RazorpayRefund | undefined;
    if (r.providerRefundId) found = await rzp.fetchRefund(r.providerRefundId);
    else if (r.paymentId) found = (await rzp.listRefunds(r.paymentId)).find((x) => !Array.isArray(x.notes) && x.notes?.refundId === r.id);
    if (!found) {
      await markRefundFailed(db, r.id, "Razorpay has no such refund: the request never reached it");
      changed++;
    } else if (found.status !== "pending") {
      await refundUpdateFromRazorpay(db, { ...found, notes: { refundId: r.id } });
      changed++;
    } else if (!r.providerRefundId) {
      await db.update(refunds).set({ providerRefundId: found.id }).where(and(eq(refunds.id, r.id), isNull(refunds.providerRefundId)));
    }
  }
  return changed;
}
