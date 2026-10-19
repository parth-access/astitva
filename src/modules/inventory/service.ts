/**
 * Inventory engine (revised PRD, sections 4.1 and P5).
 *
 *   available = on_hand − Σ(quantity of reservations that are active AND unexpired)
 *
 * - Expiry is evaluated at read time against the database clock, so a missed
 *   housekeeping run never leaves a piece locked.
 * - Reserving locks the variant rows (SELECT … FOR UPDATE) in id order, so
 *   concurrent checkouts for the last unit serialise and exactly one wins.
 * - `on_hand` changes only here, and every change writes one
 *   inventory_movements row in the same transaction.
 *
 * Every function takes a transaction handle: the caller (checkout, payments,
 * admin) owns the transaction so the order row and the stock change commit
 * or roll back together.
 */
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/create";
import {
  inventoryMovements,
  inventoryReservations,
  orders,
  productVariants,
  products,
} from "@/db/schema";
import {
  InsufficientStockError,
  InventoryError,
  ReservationStateError,
  VariantUnavailableError,
  type Shortage,
} from "./errors";

export type ReservationLine = { variantId: string; quantity: number };

type MovementType = "receipt" | "adjustment" | "damage";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mergeLines(lines: readonly ReservationLine[]): ReservationLine[] {
  const merged = new Map<string, number>();
  for (const { variantId, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InventoryError("invalid_quantity", `Quantity must be a positive integer, got ${quantity}`);
    }
    merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
  }
  return [...merged.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
}

/** Lock variant rows in a deterministic order to avoid deadlocks. */
async function lockVariants(tx: Tx, variantIds: string[], requirePurchasable: boolean) {
  const rows = await tx
    .select({
      id: productVariants.id,
      onHand: productVariants.onHand,
      isActive: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds))
    .orderBy(asc(productVariants.id))
    .for("update", { of: productVariants });

  const found = new Map(rows.map((r) => [r.id, r]));
  const unavailable = variantIds.filter((id) => {
    const r = found.get(id);
    if (!r) return true;
    return requirePurchasable && (!r.isActive || r.productStatus !== "active");
  });
  if (unavailable.length) throw new VariantUnavailableError(unavailable);
  return found;
}

/** Quantity held by live (active, unexpired) reservations, per variant. */
async function heldByVariant(db: DbOrTx, variantIds: string[], excludeOrderId?: string) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      variantId: inventoryReservations.variantId,
      held: sql<number>`coalesce(sum(${inventoryReservations.quantity}), 0)::int`,
    })
    .from(inventoryReservations)
    .where(
      and(
        inArray(inventoryReservations.variantId, variantIds),
        eq(inventoryReservations.status, "active"),
        gt(inventoryReservations.expiresAt, sql`now()`),
        excludeOrderId ? ne(inventoryReservations.orderId, excludeOrderId) : undefined,
      ),
    )
    .groupBy(inventoryReservations.variantId);
  return new Map(rows.map((r) => [r.variantId, Number(r.held)]));
}

async function changeOnHand(
  tx: Tx,
  input: {
    variantId: string;
    delta: number;
    type: "sale" | "cancellation_restock" | "return_restock" | MovementType;
    orderId?: string;
    reason?: string;
    actorId?: string;
  },
) {
  const [row] = await tx
    .update(productVariants)
    .set({ onHand: sql`${productVariants.onHand} + ${input.delta}` })
    .where(eq(productVariants.id, input.variantId))
    .returning({ onHand: productVariants.onHand });
  if (!row) throw new VariantUnavailableError([input.variantId]);

  await tx.insert(inventoryMovements).values({
    variantId: input.variantId,
    movementType: input.type,
    quantityDelta: input.delta,
    onHandAfter: row.onHand,
    orderId: input.orderId,
    reason: input.reason,
    actorId: input.actorId,
  });
  return row.onHand;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Sellable quantity right now, without locking. For display only; checkout re-checks under lock. */
export async function getAvailability(db: DbOrTx, variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const [variants, held] = await Promise.all([
    db
      .select({ id: productVariants.id, onHand: productVariants.onHand })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds)),
    heldByVariant(db, variantIds),
  ]);
  return new Map(variants.map((v) => [v.id, Math.max(0, v.onHand - (held.get(v.id) ?? 0))]));
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

/**
 * Hold stock for an order.
 * - Online payment: `mode: "hold"` creates active reservations that lapse after `ttlMinutes`.
 * - COD: `mode: "commit"` decrements on_hand immediately (there is no payment to wait for).
 *
 * Throws InsufficientStockError (nothing is held) if any line cannot be met.
 */
export async function reserveForOrder(
  tx: Tx,
  input: { orderId: string; lines: readonly ReservationLine[]; mode: "hold" | "commit"; ttlMinutes?: number },
) {
  const lines = mergeLines(input.lines);
  if (lines.length === 0) throw new InventoryError("empty_order", "Nothing to reserve");
  const ids = lines.map((l) => l.variantId);

  const locked = await lockVariants(tx, ids, true);
  const held = await heldByVariant(tx, ids);

  const shortages: Shortage[] = [];
  for (const line of lines) {
    const available = locked.get(line.variantId)!.onHand - (held.get(line.variantId) ?? 0);
    if (line.quantity > available) {
      shortages.push({ variantId: line.variantId, requested: line.quantity, available: Math.max(0, available) });
    }
  }
  if (shortages.length) throw new InsufficientStockError(shortages);

  const ttl = input.ttlMinutes ?? 15;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 60) {
    throw new InventoryError("invalid_ttl", `ttlMinutes must be between 1 and 60, got ${ttl}`);
  }

  const rows = await tx
    .insert(inventoryReservations)
    .values(
      lines.map((l) => ({
        orderId: input.orderId,
        variantId: l.variantId,
        quantity: l.quantity,
        status: input.mode === "commit" ? ("committed" as const) : ("active" as const),
        expiresAt: input.mode === "commit" ? sql`now()` : sql`now() + make_interval(mins => ${ttl})`,
      })),
    )
    .returning();

  if (input.mode === "commit") {
    for (const l of lines) {
      await changeOnHand(tx, { variantId: l.variantId, delta: -l.quantity, type: "sale", orderId: input.orderId });
    }
  }
  return rows;
}

export type CommitResult =
  | { outcome: "committed"; revived: number }
  | { outcome: "already_committed" }
  | { outcome: "stock_unavailable"; shortages: Shortage[] };

/**
 * Turn an order's held stock into a sale (called once online payment is
 * captured). Idempotent: a second call returns `already_committed`.
 *
 * If the hold lapsed before payment arrived, it tries to re-reserve. When the
 * stock has gone to someone else it changes nothing and returns
 * `stock_unavailable`, so the caller can flag the order and refund.
 */
export async function commitOrderReservations(tx: Tx, orderId: string): Promise<CommitResult> {
  // Serialise all commits/cancels for this order (webhook vs browser verify).
  const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new ReservationStateError(`Order ${orderId} not found`);

  const rows = await tx
    .select({
      id: inventoryReservations.id,
      variantId: inventoryReservations.variantId,
      quantity: inventoryReservations.quantity,
      status: inventoryReservations.status,
      createdAt: inventoryReservations.createdAt,
      lapsed: sql<boolean>`${inventoryReservations.expiresAt} <= now()`,
    })
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId));

  // Per variant still to commit: prefer a live active hold, otherwise the most
  // recent lapsed/released one (payment arrived late). The caller guarantees
  // the order itself is not cancelled.
  const committedVariants = new Set(rows.filter((r) => r.status === "committed").map((r) => r.variantId));
  const toCommit = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (committedVariants.has(r.variantId)) continue;
    const current = toCommit.get(r.variantId);
    const better =
      !current ||
      (r.status === "active" && current.status !== "active") ||
      (r.status === current.status && r.createdAt > current.createdAt);
    if (better) toCommit.set(r.variantId, r);
  }
  if (toCommit.size === 0) {
    if (committedVariants.size > 0) return { outcome: "already_committed" };
    throw new ReservationStateError(`Order ${orderId} has no reservations`);
  }

  const ids = [...toCommit.keys()].sort();
  const locked = await lockVariants(tx, ids, false);

  const isRevival = (r: (typeof rows)[number]) => r.status !== "active" || r.lapsed;
  const needsCheck = [...toCommit.values()].filter(isRevival);
  if (needsCheck.length) {
    const heldByOthers = await heldByVariant(tx, ids, orderId);
    const shortages: Shortage[] = [];
    for (const r of needsCheck) {
      const available = locked.get(r.variantId)!.onHand - (heldByOthers.get(r.variantId) ?? 0);
      if (r.quantity > available) {
        shortages.push({ variantId: r.variantId, requested: r.quantity, available: Math.max(0, available) });
      }
    }
    if (shortages.length) return { outcome: "stock_unavailable", shortages };
  }

  let revived = 0;
  for (const variantId of ids) {
    const r = toCommit.get(variantId)!;
    if (r.status === "active") {
      await tx
        .update(inventoryReservations)
        .set({ status: "committed" })
        .where(and(eq(inventoryReservations.id, r.id), eq(inventoryReservations.status, "active")));
    } else {
      // expired/released are terminal; record the late sale as a fresh committed row.
      await tx.insert(inventoryReservations).values({
        orderId,
        variantId,
        quantity: r.quantity,
        status: "committed",
        expiresAt: sql`now()`,
      });
    }
    if (isRevival(r)) revived++;
    await changeOnHand(tx, { variantId, delta: -r.quantity, type: "sale", orderId });
  }
  return { outcome: "committed", revived };
}

/** Drop an unpaid order's holds (payment failed or abandoned). Idempotent; returns rows released. */
export async function releaseOrderHolds(tx: Tx, orderId: string): Promise<number> {
  const released = await tx
    .update(inventoryReservations)
    .set({ status: "released" })
    .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")))
    .returning({ id: inventoryReservations.id });
  return released.length;
}

/**
 * Cancellation before dispatch: put committed stock back on the shelf.
 * Exactly once: the status guard in the UPDATE makes a second call a no-op,
 * even when two cancellations race.
 */
export async function restockCancelledOrder(tx: Tx, orderId: string, actorId?: string): Promise<number> {
  await releaseOrderHolds(tx, orderId);
  const rows = await tx
    .update(inventoryReservations)
    .set({ status: "released" })
    .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "committed")))
    .returning({ variantId: inventoryReservations.variantId, quantity: inventoryReservations.quantity });

  rows.sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const r of rows) {
    await changeOnHand(tx, {
      variantId: r.variantId,
      delta: r.quantity,
      type: "cancellation_restock",
      orderId,
      actorId,
    });
  }
  return rows.reduce((s, r) => s + r.quantity, 0);
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

/**
 * Receive new stock, or correct a count. A decrease may not cut into units
 * that customers are currently checking out with.
 */
export async function adjustStock(
  tx: Tx,
  input: { variantId: string; delta: number; type: MovementType; reason: string; actorId?: string },
): Promise<number> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new InventoryError("invalid_quantity", "delta must be a non-zero integer");
  }
  if (input.type === "receipt" && input.delta < 0) {
    throw new InventoryError("invalid_quantity", "A receipt must increase stock");
  }
  if (input.type === "damage" && input.delta > 0) {
    throw new InventoryError("invalid_quantity", "Damage must decrease stock");
  }
  if (!input.reason.trim()) throw new InventoryError("reason_required", "A reason is required");

  const locked = await lockVariants(tx, [input.variantId], false);
  if (input.delta < 0) {
    const held = (await heldByVariant(tx, [input.variantId])).get(input.variantId) ?? 0;
    const onHand = locked.get(input.variantId)!.onHand;
    if (onHand + input.delta < held) {
      throw new InsufficientStockError([
        { variantId: input.variantId, requested: -input.delta, available: Math.max(0, onHand - held) },
      ]);
    }
  }
  return changeOnHand(tx, input);
}

/* ------------------------------------------------------------------ */
/* Housekeeping (cron). Correctness never depends on this running.     */
/* ------------------------------------------------------------------ */

export async function markLapsedReservations(db: DbOrTx): Promise<number> {
  const rows = await db
    .update(inventoryReservations)
    .set({ status: "expired" })
    .where(and(eq(inventoryReservations.status, "active"), sql`${inventoryReservations.expiresAt} <= now()`))
    .returning({ id: inventoryReservations.id });
  return rows.length;
}
