/**
 * Orders after checkout: what the buyer sees on their order page, and what
 * Krishna does from the admin (check a COD order with the buyer, cancel).
 * Packing, shipping and refunds arrive in M5.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx, Db } from "@/db/create";
import { auditLogs, codCollections, orderEvents, orderItems, orders } from "@/db/schema";
import { InvalidTransitionError } from "@/lib/state-machine";
import { restockCancelledOrder } from "@/modules/inventory/service";
import { codCollectionMachine, orderMachine, type OrderStatus } from "./machines";

export class OrderRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRuleError";
  }
}

const itemFields = {
  id: orderItems.id,
  name: orderItems.productNameSnapshot,
  variant: orderItems.variantSnapshot,
  quantity: orderItems.quantity,
  unitPriceMinor: orderItems.unitPriceMinor,
  lineTotalMinor: orderItems.lineTotalMinor,
};

function money<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const k of keys) if (out[k] !== null) (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
}

/** The buyer's view: no internal notes. The caller checks the private link first. */
export async function getOrderForBuyer(db: DbOrTx, orderNumber: string) {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      contactEmail: orders.contactEmail,
      orderStatus: orders.orderStatus,
      paymentMethod: orders.paymentMethod,
      subtotalMinor: orders.subtotalMinor,
      shippingMinor: orders.shippingMinor,
      codFeeMinor: orders.codFeeMinor,
      totalMinor: orders.totalMinor,
      address: orders.addressSnapshot,
      customerNote: orders.customerNote,
      codVerifiedAt: orders.codVerifiedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber));
  if (!order) return null;
  const items = await db.select(itemFields).from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  return {
    ...money(order, ["subtotalMinor", "shippingMinor", "codFeeMinor", "totalMinor"]),
    items: items.map((i) => money(i, ["unitPriceMinor", "lineTotalMinor"])),
  };
}

export type OrderListFilter = "to_check" | "open" | "all";

/** Newest first. "to_check": COD orders Krishna hasn't confirmed with the buyer yet. */
export async function listOrders(db: DbOrTx, filter: OrderListFilter = "open") {
  const where =
    filter === "to_check"
      ? and(eq(orders.paymentMethod, "cod"), eq(orders.orderStatus, "confirmed"), isNull(orders.codVerifiedAt))
      : filter === "open"
        ? sql`${orders.orderStatus} not in ('delivered', 'cancelled')`
        : undefined;
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      city: sql<string>`${orders.addressSnapshot}->>'city'`,
      totalMinor: orders.totalMinor,
      orderStatus: orders.orderStatus,
      paymentMethod: orders.paymentMethod,
      codVerifiedAt: orders.codVerifiedAt,
      units: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = orders.id)`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r, totalMinor: Number(r.totalMinor), units: Number(r.units) }));
}

export async function countOrdersToCheck(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.paymentMethod, "cod"), eq(orders.orderStatus, "confirmed"), isNull(orders.codVerifiedAt)));
  return Number(row?.n ?? 0);
}

export async function getOrderForAdmin(db: DbOrTx, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const [items, events, [cod]] = await Promise.all([
    db.select({ ...itemFields, sku: orderItems.skuSnapshot }).from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.createdAt)),
    db.select().from(codCollections).where(eq(codCollections.orderId, orderId)),
  ]);
  return {
    ...money(order, ["subtotalMinor", "discountMinor", "shippingMinor", "codFeeMinor", "taxIncludedMinor", "totalMinor"]),
    items: items.map((i) => money(i, ["unitPriceMinor", "lineTotalMinor"])),
    events,
    cod: cod ? money(cod, ["amountDueMinor"]) : null,
  };
}

async function lockOrder(db: Db | DbOrTx, orderId: string) {
  const [order] = await db
    .select({ id: orders.id, status: orders.orderStatus, method: orders.paymentMethod, codVerifiedAt: orders.codVerifiedAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) throw new OrderRuleError("That order doesn't exist.");
  return order;
}

/** Krishna has confirmed a cash-on-delivery order with the buyer. Doing it twice changes nothing. */
export async function markCodVerified(db: Db, orderId: string, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.method !== "cod") throw new OrderRuleError("Only cash-on-delivery orders are checked this way.");
    if (order.codVerifiedAt) return;
    if (order.status === "cancelled") throw new OrderRuleError("This order was cancelled.");
    await tx.update(orders).set({ codVerifiedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, eventType: "cod.verified", actorType: "admin", actorId });
    await tx.insert(auditLogs).values({ actorId, action: "order.cod_verified", resourceType: "order", resourceId: orderId });
  });
}

/**
 * Cancel before dispatch: stock goes back on the shelf (once, however many
 * times this is called), and an unpaid COD collection is closed as failed.
 */
export async function cancelOrder(db: Db, orderId: string, actorId: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (!why) throw new OrderRuleError("Say why it's cancelled; the buyer may ask.");
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    try {
      orderMachine.assertTransition(order.status, "cancelled");
    } catch (err) {
      if (err instanceof InvalidTransitionError) throw new OrderRuleError(cancelRefusal(order.status));
      throw err;
    }
    await tx.update(orders).set({ orderStatus: "cancelled", cancelReason: why }).where(eq(orders.id, orderId));
    const restocked = await restockCancelledOrder(tx, orderId, actorId);

    const [cod] = await tx.select({ id: codCollections.id, status: codCollections.status }).from(codCollections).where(eq(codCollections.orderId, orderId));
    if (cod && codCollectionMachine.can(cod.status, "failed")) {
      await tx.update(codCollections).set({ status: "failed", notes: `Order cancelled: ${why}` }).where(eq(codCollections.id, cod.id));
    }
    await tx.insert(orderEvents).values({
      orderId,
      eventType: "order.cancelled",
      fromStatus: order.status,
      toStatus: "cancelled",
      actorType: "admin",
      actorId,
      metadata: { reason: why, restocked },
    });
    await tx.insert(auditLogs).values({ actorId, action: "order.cancelled", resourceType: "order", resourceId: orderId, metadata: { reason: why } });
  });
}

function cancelRefusal(status: OrderStatus): string {
  if (status === "cancelled") return "This order is already cancelled.";
  if (status === "shipped" || status === "delivered") return "It has already left. That's a return now, not a cancellation.";
  return "This order can't be cancelled now.";
}
