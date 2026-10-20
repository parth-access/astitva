import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/create";
import { inventoryMovements, orders, productVariants, products } from "../../src/db/schema";
import { adjustStock } from "../../src/modules/inventory/service";

export const testUrl = process.env.DATABASE_URL_TEST;
export const hasDb = Boolean(testUrl);

export function makeDb(max = 20): Db {
  return createDb(testUrl!, { max });
}

export async function resetData(db: Db) {
  await db.execute(sql`
    truncate table
      inventory_movements, inventory_reservations, order_events, order_items,
      payment_events, refunds, payments, cod_collections, shipments, orders,
      cart_items, carts, product_images, product_categories, product_collections,
      product_variants, products, categories, collections, suppliers,
      email_outbox, audit_logs, admin_role_assignments, users, pincodes,
      auth_sessions, auth_accounts, auth_verifications, auth_two_factors, auth_rate_limits, request_limits, stock_alerts, discount_codes
    restart identity cascade
  `);
}

export async function createVariant(db: Db, opts: { onHand: number; priceMinor?: number; status?: "active" | "draft" }) {
  const slug = `p-${randomUUID().slice(0, 8)}`;
  const [product] = await db
    .insert(products)
    .values({
      name: `Test ${slug}`,
      slug,
      status: opts.status ?? "active",
      publishedAt: (opts.status ?? "active") === "active" ? new Date() : null,
    })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({ productId: product!.id, sku: `SKU-${slug}`, priceMinor: opts.priceMinor ?? 249_900 })
    .returning();
  if (opts.onHand > 0) {
    await db.transaction((tx) =>
      adjustStock(tx, { variantId: variant!.id, delta: opts.onHand, type: "receipt", reason: "test receipt" }),
    );
  }
  return variant!;
}

export async function createOrder(db: Db, method: "online" | "cod" = "online") {
  const [order] = await db
    .insert(orders)
    .values({
      contactName: "Test Buyer",
      contactPhone: "9999999999",
      orderStatus: method === "online" ? "pending_payment" : "confirmed",
      paymentMethod: method,
      subtotalMinor: 249_900,
      totalMinor: 249_900,
      addressSnapshot: {
        recipientName: "Test Buyer",
        phone: "9999999999",
        line1: "1 Test Lane",
        city: "Sonipat",
        state: "Haryana",
        pincode: "131001",
        countryCode: "IN",
      },
      idempotencyScope: "test",
      idempotencyKey: randomUUID(),
    })
    .returning();
  return order!;
}

export async function onHand(db: Db, variantId: string) {
  const [row] = await db
    .select({ onHand: productVariants.onHand })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row!.onHand;
}

/** Invariant: on_hand always equals the sum of its movement deltas. */
export async function movementSum(db: Db, variantId: string) {
  const [row] = await db
    .select({ sum: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}), 0)::int` })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId));
  return Number(row!.sum);
}

export async function expireHolds(db: Db, orderId: string) {
  await db.execute(
    sql`update inventory_reservations set expires_at = now() - interval '1 minute' where order_id = ${orderId} and status = 'active'`,
  );
}
