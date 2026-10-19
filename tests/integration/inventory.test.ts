import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { inventoryReservations, productVariants } from "../../src/db/schema";
import { InsufficientStockError, VariantUnavailableError } from "../../src/modules/inventory/errors";
import {
  adjustStock,
  commitOrderReservations,
  getAvailability,
  markLapsedReservations,
  releaseOrderHolds,
  reserveForOrder,
  restockCancelledOrder,
} from "../../src/modules/inventory/service";
import {
  createOrder,
  createVariant,
  expireHolds,
  hasDb,
  makeDb,
  movementSum,
  onHand,
  resetData,
} from "./helpers";

describe.skipIf(!hasDb)("inventory engine (real Postgres)", () => {
  const db = makeDb(20);

  beforeEach(async () => {
    await resetData(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  async function race(variantId: string, buyers: number, mode: "hold" | "commit" = "hold") {
    const orders = await Promise.all(Array.from({ length: buyers }, () => createOrder(db, mode === "commit" ? "cod" : "online")));
    const results = await Promise.allSettled(
      orders.map((o) =>
        db.transaction((tx) => reserveForOrder(tx, { orderId: o.id, lines: [{ variantId, quantity: 1 }], mode })),
      ),
    );
    const won = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    return { won, rejected };
  }

  it("50 buyers racing for a one-of-one piece: exactly one wins", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const { won, rejected } = await race(v.id, 50);
    expect(won).toBe(1);
    expect(rejected).toHaveLength(49);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientStockError);
    expect((await getAvailability(db, [v.id])).get(v.id)).toBe(0);
  });

  it("50 buyers racing for 3 units: exactly three win", async () => {
    const v = await createVariant(db, { onHand: 3 });
    const { won } = await race(v.id, 50);
    expect(won).toBe(3);
  });

  it("50 COD buyers racing for 2 units: stock never goes negative", async () => {
    const v = await createVariant(db, { onHand: 2 });
    const { won } = await race(v.id, 50, "commit");
    expect(won).toBe(2);
    expect(await onHand(db, v.id)).toBe(0);
    expect(await movementSum(db, v.id)).toBe(0);
  });

  it("a lapsed hold frees the piece without any cron job", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const first = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: first.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" }));
    expect((await getAvailability(db, [v.id])).get(v.id)).toBe(0);

    await expireHolds(db, first.id);
    expect((await getAvailability(db, [v.id])).get(v.id)).toBe(1);

    const second = await createOrder(db);
    await expect(
      db.transaction((tx) => reserveForOrder(tx, { orderId: second.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" })),
    ).resolves.toHaveLength(1);
  });

  it("commit is idempotent: webhook and browser verify racing decrement stock once", async () => {
    const v = await createVariant(db, { onHand: 2 });
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" }));

    const results = await Promise.all([
      db.transaction((tx) => commitOrderReservations(tx, order.id)),
      db.transaction((tx) => commitOrderReservations(tx, order.id)),
      db.transaction((tx) => commitOrderReservations(tx, order.id)),
    ]);
    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["already_committed", "already_committed", "committed"]);
    expect(await onHand(db, v.id)).toBe(1);
    expect(await movementSum(db, v.id)).toBe(1);
  });

  it("late payment re-reserves when the piece is still free", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" }));
    await expireHolds(db, order.id);
    await markLapsedReservations(db);

    const result = await db.transaction((tx) => commitOrderReservations(tx, order.id));
    expect(result).toEqual({ outcome: "committed", revived: 1 });
    expect(await onHand(db, v.id)).toBe(0);
  });

  it("late payment reports stock_unavailable when someone else bought the piece, and changes nothing", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const slow = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: slow.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" }));
    await expireHolds(db, slow.id);

    const fast = await createOrder(db, "cod");
    await db.transaction((tx) => reserveForOrder(tx, { orderId: fast.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "commit" }));

    const result = await db.transaction((tx) => commitOrderReservations(tx, slow.id));
    expect(result.outcome).toBe("stock_unavailable");
    expect(await onHand(db, v.id)).toBe(0);
    expect(await movementSum(db, v.id)).toBe(0);
  });

  it("cancellation restocks exactly once even when two cancels race", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const order = await createOrder(db, "cod");
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "commit" }));
    expect(await onHand(db, v.id)).toBe(0);

    const restocked = await Promise.all([
      db.transaction((tx) => restockCancelledOrder(tx, order.id)),
      db.transaction((tx) => restockCancelledOrder(tx, order.id)),
    ]);
    expect(restocked.sort()).toEqual([0, 1]);
    expect(await onHand(db, v.id)).toBe(1);
    expect(await movementSum(db, v.id)).toBe(1);
  });

  it("releasing an unpaid order's holds makes the piece available again", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: v.id, quantity: 1 }], mode: "hold" }));
    expect(await db.transaction((tx) => releaseOrderHolds(tx, order.id))).toBe(1);
    expect(await db.transaction((tx) => releaseOrderHolds(tx, order.id))).toBe(0);
    expect((await getAvailability(db, [v.id])).get(v.id)).toBe(1);
  });

  it("refuses unpublished products and inactive variants", async () => {
    const draft = await createVariant(db, { onHand: 1, status: "draft" });
    const order = await createOrder(db);
    await expect(
      db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: draft.id, quantity: 1 }], mode: "hold" })),
    ).rejects.toBeInstanceOf(VariantUnavailableError);

    const off = await createVariant(db, { onHand: 1 });
    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, off.id));
    await expect(
      db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: off.id, quantity: 1 }], mode: "hold" })),
    ).rejects.toBeInstanceOf(VariantUnavailableError);
  });

  it("a multi-line order is all-or-nothing", async () => {
    const a = await createVariant(db, { onHand: 1 });
    const b = await createVariant(db, { onHand: 0 });
    const order = await createOrder(db);
    await expect(
      db.transaction((tx) =>
        reserveForOrder(tx, {
          orderId: order.id,
          lines: [
            { variantId: a.id, quantity: 1 },
            { variantId: b.id, quantity: 1 },
          ],
          mode: "hold",
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const [{ count }] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryReservations)) as [{ count: number }];
    expect(count).toBe(0);
  });

  it("admin cannot reduce stock below units held by shoppers in checkout", async () => {
    const v = await createVariant(db, { onHand: 2 });
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: v.id, quantity: 2 }], mode: "hold" }));
    await expect(
      db.transaction((tx) => adjustStock(tx, { variantId: v.id, delta: -1, type: "damage", reason: "torn seam" })),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("the database rejects negative stock even if application code is wrong", async () => {
    const v = await createVariant(db, { onHand: 1 });
    await expect(
      db.update(productVariants).set({ onHand: -1 }).where(eq(productVariants.id, v.id)),
    ).rejects.toThrow();
  });
});
