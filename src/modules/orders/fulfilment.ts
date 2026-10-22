/**
 * After an order is confirmed: packing, sending, and what comes back.
 *
 *   confirmed ──pack──▶ packed ──ship──▶ shipped ──▶ delivered
 *                                            └──────▶ returned (RTO: courier brought it back)
 *
 * Cash on delivery adds its own trail (cod_collections): pending → collected
 * by the courier on delivery → remitted when the courier pays us. Only then is
 * a COD order "paid". Every step goes through the machines and writes an
 * order event and an audit row, in one transaction with the order row locked.
 */
import { desc, eq } from "drizzle-orm";
import type { Db, Tx } from "@/db/create";
import { auditLogs, codCollections, orderEvents, orders, shipments } from "@/db/schema";
import { alertOwners, queueEmail } from "@/modules/email/outbox";
import { formatINR } from "@/lib/money";
import { InvalidTransitionError } from "@/lib/state-machine";
import { restockCancelledOrder } from "@/modules/inventory/service";
import { codCollectionMachine, orderMachine, orderPaymentMachine, type OrderStatus } from "./machines";
import { OrderRuleError } from "./service";

type Order = typeof orders.$inferSelect;

async function withOrder<T>(db: Db, orderId: string, work: (tx: Tx, order: Order) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new OrderRuleError("That order doesn't exist.");
    return work(tx, order);
  });
}

async function move(tx: Tx, order: Order, to: OrderStatus, actorId: string, eventType: string, metadata?: Record<string, unknown>) {
  try {
    orderMachine.assertTransition(order.orderStatus, to);
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw new OrderRuleError(`It's ${order.orderStatus.replace("_", " ")}, so it can't be marked ${to} now.`);
    throw err;
  }
  await tx.update(orders).set({ orderStatus: to }).where(eq(orders.id, order.id));
  await tx.insert(orderEvents).values({ orderId: order.id, eventType, fromStatus: order.orderStatus, toStatus: to, actorType: "admin", actorId, metadata });
  await tx.insert(auditLogs).values({ actorId, action: eventType, resourceType: "order", resourceId: order.id, metadata });
  order.orderStatus = to;
}

/** Why an order can't be packed yet, or null. */
export function packingBlocker(order: Pick<Order, "needsResolution" | "paymentMethod" | "paymentStatus">): string | null {
  if (order.needsResolution) return "Sort out what's flagged first.";
  if (order.paymentMethod === "online" && order.paymentStatus !== "paid") return "It isn't paid.";
  return null;
}

export async function packOrder(db: Db, orderId: string, actorId: string): Promise<void> {
  await withOrder(db, orderId, async (tx, order) => {
    const blocker = packingBlocker(order);
    if (blocker) throw new OrderRuleError(blocker);
    await move(tx, order, "packed", actorId, "order.packed");
  });
}

/** Packed by mistake (or something to change before it goes). */
export async function unpackOrder(db: Db, orderId: string, actorId: string): Promise<void> {
  await withOrder(db, orderId, (tx, order) => move(tx, order, "confirmed", actorId, "order.unpacked"));
}

export type ShipmentInput = { carrierName: string; trackingNumber: string; trackingUrl: string | null };

/** Handed to the courier. From "confirmed" it is packed and shipped in one go. */
export async function shipOrder(db: Db, orderId: string, actorId: string, input: ShipmentInput): Promise<void> {
  const carrierName = input.carrierName.trim();
  const trackingNumber = input.trackingNumber.trim();
  if (!carrierName) throw new OrderRuleError("Which courier?");
  if (!trackingNumber) throw new OrderRuleError("The tracking (AWB) number, so the buyer can follow it.");
  const trackingUrl = input.trackingUrl?.trim() || null;
  if (trackingUrl && !/^https:\/\/\S+$/.test(trackingUrl)) throw new OrderRuleError("A tracking link starting https://, or leave it blank.");

  await withOrder(db, orderId, async (tx, order) => {
    if (order.orderStatus === "confirmed") {
      const blocker = packingBlocker(order);
      if (blocker) throw new OrderRuleError(blocker);
      await move(tx, order, "packed", actorId, "order.packed");
    }
    await move(tx, order, "shipped", actorId, "order.shipped", { carrierName, trackingNumber });
    await tx.insert(shipments).values({ orderId, carrierName, trackingNumber, trackingUrl, createdBy: actorId });
    if (order.contactEmail) {
      await queueEmail(tx, { dedupeKey: `order_shipped:${orderId}`, template: "order_shipped", to: order.contactEmail, payload: { orderId } });
    }
  });
}

async function latestShipment(tx: Tx, orderId: string) {
  const [s] = await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(desc(shipments.createdAt)).limit(1);
  return s ?? null;
}

async function codTo(tx: Tx, orderId: string, to: "collected_by_courier" | "remitted" | "failed", set: Partial<typeof codCollections.$inferInsert>) {
  const [cod] = await tx.select().from(codCollections).where(eq(codCollections.orderId, orderId)).for("update");
  if (!cod) return null;
  codCollectionMachine.assertTransition(cod.status, to);
  await tx.update(codCollections).set({ status: to, ...set }).where(eq(codCollections.id, cod.id));
  return cod;
}

/** The courier delivered it. For COD, the courier now holds the cash. */
export async function markDelivered(db: Db, orderId: string, actorId: string): Promise<void> {
  await withOrder(db, orderId, async (tx, order) => {
    await move(tx, order, "delivered", actorId, "order.delivered");
    const shipment = await latestShipment(tx, orderId);
    if (shipment) await tx.update(shipments).set({ status: "delivered", deliveredAt: new Date() }).where(eq(shipments.id, shipment.id));
    if (order.paymentMethod === "cod") await codTo(tx, orderId, "collected_by_courier", { collectedAt: new Date(), confirmedBy: actorId });
  });
}

/**
 * The courier brought it back undelivered (RTO). The pieces go back on sale
 * (as a return movement), COD collection fails, and a paid order is flagged
 * for a refund.
 */
export async function markReturnedToOrigin(db: Db, orderId: string, actorId: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (!why) throw new OrderRuleError("Say why it came back (refused, wrong address, unreachable…).");
  await withOrder(db, orderId, async (tx, order) => {
    await move(tx, order, "returned", actorId, "order.returned", { reason: why });
    const shipment = await latestShipment(tx, orderId);
    if (shipment) await tx.update(shipments).set({ status: "returned_to_origin" }).where(eq(shipments.id, shipment.id));
    await restockCancelledOrder(tx, orderId, actorId, "return_restock");
    if (order.paymentMethod === "cod") await codTo(tx, orderId, "failed", { notes: `Returned: ${why}` });
    if (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") {
      await tx
        .update(orders)
        .set({ needsResolution: true, resolutionNote: `Came back undelivered (${why}). Refund the buyer ${formatINR(Number(order.totalMinor))}, or resend.` })
        .where(eq(orders.id, orderId));
      await alertOwners(tx, "owner_needs_you", `${orderId}:${Date.now()}`, { orderId });
    }
  });
}

/** The courier paid over the cash for a COD order. Now it counts as paid. */
export async function markCodRemitted(db: Db, orderId: string, actorId: string, reference: string): Promise<void> {
  const ref = reference.trim().slice(0, 120) || null;
  await withOrder(db, orderId, async (tx, order) => {
    if (order.paymentMethod !== "cod") throw new OrderRuleError("Only cash-on-delivery orders are remitted by the courier.");
    const cod = await codTo(tx, orderId, "remitted", { remittedAt: new Date(), remittanceReference: ref });
    if (!cod) throw new OrderRuleError("This order has no cash to collect.");
    orderPaymentMachine.assertTransition(order.paymentStatus, "paid");
    await tx.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, eventType: "cod.remitted", actorType: "admin", actorId, metadata: { reference: ref } });
    await tx.insert(auditLogs).values({ actorId, action: "order.cod_remitted", resourceType: "order", resourceId: orderId, metadata: { reference: ref } });
  });
}

/** Krishna has dealt with what was flagged (rebooked, swapped, refunded outside the site). */
export async function resolveOrder(db: Db, orderId: string, actorId: string, note: string): Promise<void> {
  const what = note.trim();
  if (!what) throw new OrderRuleError("Note what you did, for the record.");
  await withOrder(db, orderId, async (tx, order) => {
    if (!order.needsResolution) return;
    await tx.update(orders).set({ needsResolution: false, resolutionNote: `${order.resolutionNote ?? ""}\nResolved: ${what}`.trim() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, eventType: "order.resolved", actorType: "admin", actorId, metadata: { note: what } });
    await tx.insert(auditLogs).values({ actorId, action: "order.resolved", resourceType: "order", resourceId: orderId, metadata: { note: what } });
  });
}
