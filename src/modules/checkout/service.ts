/**
 * Guest checkout. Everything that costs money is read from the database here,
 * under lock, never from the browser.
 *
 * Cash on delivery: the order is placed "confirmed" and its stock is taken
 * off the shelf at once (there is no payment to wait for). Krishna confirms
 * each one with the buyer on WhatsApp before packing.
 *
 * Online: the order waits "pending_payment" with its stock held for the
 * store's reservation time (15 minutes by default); the bag is kept until the
 * payment arrives (src/modules/payments). Starting a new online checkout from
 * the same bag cancels the earlier unpaid one, so a buyer never holds stock
 * against themselves.
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db/create";
import {
  cartItems,
  carts,
  codCollections,
  orderEvents,
  orderItems,
  orders,
  pincodes,
  productVariants,
  products,
  storeSettings,
} from "@/db/schema";
import { formatPieceNumber } from "@/lib/format";
import { allocateDiscount } from "@/lib/money";
import { claimCode, DiscountError, releaseCodeUse } from "@/modules/discounts/service";
import { InsufficientStockError, VariantUnavailableError } from "@/modules/inventory/errors";
import { releaseOrderHolds, reserveForOrder } from "@/modules/inventory/service";
import { alertOwners, queueEmail } from "@/modules/email/outbox";
import { orderMachine } from "@/modules/orders/machines";
import type { CheckoutInput } from "./input";
import { priceOrder } from "./pricing";

/** A phone number may have this many cash-on-delivery orders not yet packed: a brake on fake orders. */
export const MAX_UNVERIFIED_COD = 2;

export type CheckoutErrorCode =
  | "ordering_closed"
  | "cod_off"
  | "empty"
  | "unavailable"
  | "over_cod_limit"
  | "pincode"
  | "too_many_unverified"
  | "discount";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    /** For "unavailable": the variants that can't be had in the quantity asked. */
    readonly variantIds: string[] = [],
    /** For "discount": why the code can't be used, said to the buyer. */
    readonly detail?: string,
  ) {
    super(`Checkout: ${code}`);
    this.name = "CheckoutError";
  }
}

export type PlacedOrder = {
  orderId: string;
  orderNumber: string;
  /** The same checkout submitted again (double tap): the first order is returned. */
  repeated: boolean;
  paymentMethod: "cod" | "online";
  orderStatus: (typeof orders.$inferSelect)["orderStatus"];
  totalMinor: number;
};

/** The name an order line keeps for good: "Nº 01 Neem, linen wrap dress". */
export function lineName(p: { pieceNumber: number | null; pieceName: string | null; name: string }): string {
  const name = p.pieceName ? `${p.pieceName}, ${p.name.toLowerCase()}` : p.name;
  return (p.pieceNumber ? `${formatPieceNumber(p.pieceNumber)} ${name}` : name).slice(0, 160);
}

/** Cancel this bag's earlier unpaid online orders and drop their holds. */
async function supersedeUnpaid(tx: Tx, bagId: string) {
  const stale = await tx
    .select({ id: orders.id, status: orders.orderStatus })
    .from(orders)
    .where(and(eq(orders.idempotencyScope, bagId), eq(orders.orderStatus, "pending_payment"), eq(orders.paymentStatus, "unpaid")))
    .for("update");
  for (const o of stale) {
    orderMachine.assertTransition(o.status, "cancelled");
    await tx.update(orders).set({ orderStatus: "cancelled", cancelReason: "Checkout started again" }).where(eq(orders.id, o.id));
    await releaseOrderHolds(tx, o.id);
    await releaseCodeUse(tx, o.id);
    await tx.insert(orderEvents).values({
      orderId: o.id,
      eventType: "order.superseded",
      fromStatus: o.status,
      toStatus: "cancelled",
      actorType: "customer",
    });
  }
}

export async function placeOrder(db: Db, bagId: string, input: CheckoutInput): Promise<PlacedOrder> {
  const method = input.paymentMethod;
  return db.transaction(async (tx) => {
    // One checkout per bag at a time: a double tap waits here, then finds the order below.
    const [bag] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, bagId)).for("update");
    if (!bag) throw new CheckoutError("empty");

    const [existing] = await tx
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        paymentMethod: orders.paymentMethod,
        orderStatus: orders.orderStatus,
        totalMinor: orders.totalMinor,
      })
      .from(orders)
      .where(and(eq(orders.idempotencyScope, bagId), eq(orders.idempotencyKey, input.idempotencyKey)));
    if (existing) return { ...existing, totalMinor: Number(existing.totalMinor), repeated: true };

    const [settings] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1));
    if (!settings?.orderingOpen) throw new CheckoutError("ordering_closed");
    if (method === "cod" && !settings.codEnabled) throw new CheckoutError("cod_off");

    if (method === "online") await supersedeUnpaid(tx, bagId);

    const lines = await tx
      .select({
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        sku: productVariants.sku,
        size: productVariants.size,
        colour: productVariants.color,
        condition: productVariants.condition,
        unitPriceMinor: productVariants.priceMinor,
        isActive: productVariants.isActive,
        status: products.status,
        name: products.name,
        pieceName: products.pieceName,
        pieceNumber: products.pieceNumber,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(cartItems.cartId, bagId))
      .orderBy(asc(cartItems.createdAt));
    if (lines.length === 0) throw new CheckoutError("empty");
    const withdrawn = lines.filter((l) => !l.isActive || l.status !== "active").map((l) => l.variantId);
    if (withdrawn.length) throw new CheckoutError("unavailable", withdrawn);

    const priced = lines.map((l) => ({ unitPriceMinor: Number(l.unitPriceMinor), quantity: l.quantity }));
    let discount: Awaited<ReturnType<typeof claimCode>> | null = null;
    if (input.discountCode) {
      try {
        discount = await claimCode(tx, input.discountCode, {
          subtotalMinor: priced.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0),
          phone: input.contact.phone,
        });
      } catch (err) {
        if (err instanceof DiscountError) throw new CheckoutError("discount", [], err.message);
        throw err;
      }
    }
    const totals = priceOrder(
      priced,
      {
        shippingFlatMinor: Number(settings.shippingFlatMinor),
        freeShippingThresholdMinor: settings.freeShippingThresholdMinor === null ? null : Number(settings.freeShippingThresholdMinor),
        codFeeMinor: Number(settings.codFeeMinor),
      },
      method,
      discount?.rule ?? null,
    );
    if (method === "cod" && totals.totalMinor > Number(settings.codMaxOrderMinor)) throw new CheckoutError("over_cod_limit");

    if (settings.restrictToListedPincodes) {
      const [pin] = await tx.select().from(pincodes).where(eq(pincodes.pincode, input.address.pincode));
      if (!pin?.isServiceable || (method === "cod" && !pin.codAllowed)) throw new CheckoutError("pincode");
    }

    if (method === "cod") {
      const [waiting] = await tx
        .select({ n: count() })
        .from(orders)
        .where(
          and(
            eq(orders.contactPhone, input.contact.phone),
            eq(orders.paymentMethod, "cod"),
            eq(orders.orderStatus, "confirmed"),
            isNull(orders.codVerifiedAt),
          ),
        );
      if ((waiting?.n ?? 0) >= MAX_UNVERIFIED_COD) throw new CheckoutError("too_many_unverified");
    }

    const orderStatus = method === "cod" ? "confirmed" : "pending_payment";
    const [order] = await tx
      .insert(orders)
      .values({
        contactName: input.contact.name,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        orderStatus,
        paymentMethod: method,
        ...totals,
        addressSnapshot: input.address,
        customerNote: input.note,
        discountCode: discount?.code ?? null,
        discountCodeId: discount?.id ?? null,
        idempotencyScope: bagId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    const orderId = order!.id;

    // Take (or hold) the stock before writing order lines. A line's reference
    // to its variant takes a shared lock on that row; taking it first and the
    // row lock second would deadlock two buyers of the same piece.
    try {
      await reserveForOrder(tx, {
        orderId,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        mode: method === "cod" ? "commit" : "hold",
        ttlMinutes: settings.reservationTtlMinutes,
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) throw new CheckoutError("unavailable", err.shortages.map((s) => s.variantId));
      if (err instanceof VariantUnavailableError) throw new CheckoutError("unavailable", err.variantIds);
      throw err;
    }

    // The discount is shared across the lines in proportion, to the paisa (for refunds and invoices).
    const lineDiscounts = allocateDiscount(
      priced.map((l) => l.unitPriceMinor * l.quantity),
      totals.discountMinor,
    );
    await tx.insert(orderItems).values(
      lines.map((l, i) => ({
        orderId,
        variantId: l.variantId,
        productNameSnapshot: lineName(l),
        skuSnapshot: l.sku,
        variantSnapshot: { size: l.size, color: l.colour, condition: l.condition },
        quantity: l.quantity,
        unitPriceMinor: Number(l.unitPriceMinor),
        discountMinor: lineDiscounts[i]!,
        lineTotalMinor: Number(l.unitPriceMinor) * l.quantity - lineDiscounts[i]!,
      })),
    );

    await tx.insert(orderEvents).values({
      orderId,
      eventType: method === "cod" ? "order.placed" : "order.awaiting_payment",
      toStatus: orderStatus,
      actorType: "customer",
      metadata: { paymentMethod: method, totalMinor: totals.totalMinor },
    });

    if (method === "cod") {
      await tx.insert(codCollections).values({ orderId, amountDueMinor: totals.totalMinor });
      await queueOrderPlacedEmails(tx, orderId, order!.orderNumber, input.contact.email);
      await tx.delete(cartItems).where(eq(cartItems.cartId, bagId));
    }

    return { orderId, orderNumber: order!.orderNumber, repeated: false, paymentMethod: method, orderStatus, totalMinor: totals.totalMinor };
  });
}

/**
 * A placed order: the buyer's "thank you" (if they gave an email) and the
 * owners' alert. Once per order, however often this is called.
 */
export async function queueOrderPlacedEmails(tx: Tx, orderId: string, orderNumber: string, buyerEmail: string | null) {
  if (buyerEmail) await queueEmail(tx, { dedupeKey: `order_placed:${orderId}`, template: "order_placed", to: buyerEmail, payload: { orderId, orderNumber } });
  await alertOwners(tx, "owner_new_order", orderId, { orderId });
}
