/**
 * "Tell me when it's back" for a sold-out colour and size.
 *
 * Signing up stores an email against that variant. Whenever stock may have
 * come back (the 15-minute job, and right after Krishna saves a piece or an
 * order's stock is put back), waiting alerts whose variant can be bought again
 * are marked notified and an email is queued for each, once.
 *
 * Addresses are used for nothing else and deleted 90 days after notifying (or
 * after 180 days of waiting).
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/create";
import { productVariants, products, stockAlerts } from "@/db/schema";
import { queueEmail } from "@/modules/email/outbox";
import { getAvailability } from "@/modules/inventory/service";

export type SubscribeOutcome = "subscribed" | "already" | "in_stock" | "unavailable" | "invalid_email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeToRestock(db: DbOrTx, variantId: string, rawEmail: string): Promise<SubscribeOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return "invalid_email";
  const [v] = await db
    .select({ isActive: productVariants.isActive, status: products.status })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId));
  if (!v || !v.isActive || v.status !== "active") return "unavailable";
  if (((await getAvailability(db, [variantId])).get(variantId) ?? 0) > 0) return "in_stock";
  const inserted = await db.insert(stockAlerts).values({ variantId, email }).onConflictDoNothing().returning({ id: stockAlerts.id });
  return inserted.length ? "subscribed" : "already";
}

/** Notify everyone waiting for a variant that can be bought again. Returns how many emails were queued. */
export async function notifyRestocked(db: Db, limit = 500): Promise<number> {
  const waiting = await db
    .selectDistinct({ variantId: stockAlerts.variantId })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(isNull(stockAlerts.notifiedAt), eq(productVariants.isActive, true), eq(products.status, "active")))
    .limit(limit);
  if (waiting.length === 0) return 0;
  const available = await getAvailability(
    db,
    waiting.map((w) => w.variantId),
  );
  const back = waiting.map((w) => w.variantId).filter((id) => (available.get(id) ?? 0) > 0);
  if (back.length === 0) return 0;

  return db.transaction(async (tx) => {
    // Claiming by setting notified_at means two runs at once never email twice.
    const claimed = await tx
      .update(stockAlerts)
      .set({ notifiedAt: sql`now()` })
      .where(and(inArray(stockAlerts.variantId, back), isNull(stockAlerts.notifiedAt)))
      .returning({ id: stockAlerts.id, variantId: stockAlerts.variantId, email: stockAlerts.email });
    for (const a of claimed) {
      await queueEmail(tx, { dedupeKey: `back_in_stock:${a.id}`, template: "back_in_stock", to: a.email, payload: { variantId: a.variantId } });
    }
    return claimed.length;
  });
}

/** Daily: forget addresses once they've done their job, or after waiting half a year. */
export async function clearOldAlerts(db: DbOrTx): Promise<number> {
  const rows = await db
    .delete(stockAlerts)
    .where(
      or(
        lt(stockAlerts.notifiedAt, sql`now() - interval '90 days'`),
        and(isNull(stockAlerts.notifiedAt), lt(stockAlerts.createdAt, sql`now() - interval '180 days'`)),
      ),
    )
    .returning({ id: stockAlerts.id });
  return rows.length;
}

/** How many people wait for each variant of a piece (for the admin editor). */
export async function waitingByVariant(db: DbOrTx, variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await db
    .select({ variantId: stockAlerts.variantId, n: sql<number>`count(*)::int` })
    .from(stockAlerts)
    .where(and(inArray(stockAlerts.variantId, variantIds), isNull(stockAlerts.notifiedAt)))
    .groupBy(stockAlerts.variantId);
  return new Map(rows.map((r) => [r.variantId, Number(r.n)]));
}
