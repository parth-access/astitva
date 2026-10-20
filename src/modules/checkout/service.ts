/**
 * Guest checkout. Everything that costs money is read from the database here,
 * under lock, never from the browser.
 *
 * Cash on delivery: the order is placed "confirmed" and its stock is taken
 * off the shelf in the same transaction (there is no payment to wait for).
 * Krishna then confirms each order with the buyer on WhatsApp before packing
 * and marks it verified in the admin.
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/create";
import {
  cartItems,
  carts,
  codCollections,
  emailOutbox,
  orderEvents,
  orderItems,
  orders,
  pincodes,
  productVariants,
  products,
  storeSettings,
} from "@/db/schema";
import { formatPieceNumber } from "@/lib/format";
import { InsufficientStockError, VariantUnavailableError } from "@/modules/inventory/errors";
import { reserveForOrder } from "@/modules/inventory/service";
import type { CheckoutInput } from "./input";
import { priceOrder } from "./pricing";

/** A phone number may have this many cash-on-delivery orders waiting for Krishna's check. */
export const MAX_UNVERIFIED_COD = 2;

export type CheckoutErrorCode =
  | "ordering_closed"
  | "cod_off"
  | "empty"
  | "unavailable"
  | "over_cod_limit"
  | "pincode"
  | "too_many_unverified";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    /** For "unavailable": the variants that can't be had in the quantity asked. */
    readonly variantIds: string[] = [],
  ) {
    super(`Checkout: ${code}`);
    this.name = "CheckoutError";
  }
}

export type PlacedOrder = { orderId: string; orderNumber: string; repeated: boolean };

/** The name an order line keeps for good: "Nº 01 Neem, linen wrap dress". */
export function lineName(p: { pieceNumber: number | null; pieceName: string | null; name: string }): string {
  const name = p.pieceName ? `${p.pieceName}, ${p.name.toLowerCase()}` : p.name;
  return (p.pieceNumber ? `${formatPieceNumber(p.pieceNumber)} ${name}` : name).slice(0, 160);
}

export async function placeCodOrder(db: Db, bagId: string, input: CheckoutInput): Promise<PlacedOrder> {
  return db.transaction(async (tx) => {
    // One checkout per bag at a time: a double tap waits here, then finds the order below.
    const [bag] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, bagId)).for("update");
    if (!bag) throw new CheckoutError("empty");

    const [existing] = await tx
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.idempotencyScope, bagId), eq(orders.idempotencyKey, input.idempotencyKey)));
    if (existing) return { orderId: existing.id, orderNumber: existing.orderNumber, repeated: true };

    const [settings] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1));
    if (!settings?.orderingOpen) throw new CheckoutError("ordering_closed");
    if (!settings.codEnabled) throw new CheckoutError("cod_off");

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

    const totals = priceOrder(
      lines.map((l) => ({ unitPriceMinor: Number(l.unitPriceMinor), quantity: l.quantity })),
      {
        shippingFlatMinor: Number(settings.shippingFlatMinor),
        freeShippingThresholdMinor: settings.freeShippingThresholdMinor === null ? null : Number(settings.freeShippingThresholdMinor),
        codFeeMinor: Number(settings.codFeeMinor),
      },
      "cod",
    );
    if (totals.totalMinor > Number(settings.codMaxOrderMinor)) throw new CheckoutError("over_cod_limit");

    if (settings.restrictToListedPincodes) {
      const [pin] = await tx.select().from(pincodes).where(eq(pincodes.pincode, input.address.pincode));
      if (!pin?.isServiceable || !pin.codAllowed) throw new CheckoutError("pincode");
    }

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

    const [order] = await tx
      .insert(orders)
      .values({
        contactName: input.contact.name,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        orderStatus: "confirmed",
        paymentMethod: "cod",
        ...totals,
        addressSnapshot: input.address,
        customerNote: input.note,
        idempotencyScope: bagId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    // Take the stock before writing order lines. A line's reference to its
    // variant takes a shared lock on that row; taking it first and the row
    // lock second would deadlock two buyers of the same piece.
    try {
      await reserveForOrder(tx, {
        orderId: order!.id,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        mode: "commit",
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) throw new CheckoutError("unavailable", err.shortages.map((s) => s.variantId));
      if (err instanceof VariantUnavailableError) throw new CheckoutError("unavailable", err.variantIds);
      throw err;
    }

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order!.id,
        variantId: l.variantId,
        productNameSnapshot: lineName(l),
        skuSnapshot: l.sku,
        variantSnapshot: { size: l.size, color: l.colour, condition: l.condition },
        quantity: l.quantity,
        unitPriceMinor: Number(l.unitPriceMinor),
        lineTotalMinor: Number(l.unitPriceMinor) * l.quantity,
      })),
    );

    await tx.insert(codCollections).values({ orderId: order!.id, amountDueMinor: totals.totalMinor });
    await tx.insert(orderEvents).values({
      orderId: order!.id,
      eventType: "order.placed",
      toStatus: "confirmed",
      actorType: "customer",
      metadata: { paymentMethod: "cod", totalMinor: totals.totalMinor },
    });
    if (input.contact.email) {
      await tx.insert(emailOutbox).values({
        dedupeKey: `order_placed:${order!.id}`,
        template: "order_placed",
        toAddress: input.contact.email,
        payload: { orderId: order!.id, orderNumber: order!.orderNumber },
      });
    }
    await tx.delete(cartItems).where(eq(cartItems.cartId, bagId));

    return { orderId: order!.id, orderNumber: order!.orderNumber, repeated: false };
  });
}
