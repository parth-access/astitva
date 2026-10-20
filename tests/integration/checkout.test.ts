import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { codCollections, emailOutbox, orderItems, orders, products, storeSettings, users } from "../../src/db/schema";
import { addToBag, BagError, openBag, readBag, setLineQuantity } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { CheckoutError, placeCodOrder } from "../../src/modules/checkout/service";
import { cancelOrder, markCodVerified, OrderRuleError } from "../../src/modules/orders/service";
import { createVariant, hasDb, makeDb, movementSum, onHand, resetData } from "./helpers";

function buyer(overrides: Partial<CheckoutInput["contact"]> = {}, key = randomUUID()): CheckoutInput {
  const contact = { name: "Asha Rao", phone: "9812345678", email: "asha@example.com", ...overrides };
  return {
    idempotencyKey: key,
    contact,
    address: { recipientName: contact.name, phone: contact.phone, line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
    paymentMethod: "cod",
  };
}

async function expectCheckout(p: Promise<unknown>, code: CheckoutError["code"]) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(CheckoutError);
  expect((err as CheckoutError).code).toBe(code);
}

describe.skipIf(!hasDb)("bag and cash-on-delivery checkout", () => {
  const db = makeDb(8);
  let adminId: string;

  const settings = (set: Partial<typeof storeSettings.$inferInsert>) =>
    db.insert(storeSettings).values({ id: 1, ...set }).onConflictDoUpdate({ target: storeSettings.id, set });

  async function bagWith(variantId: string, quantity = 1) {
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, variantId, quantity);
    return bag.id;
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await settings({ orderingOpen: true, codEnabled: true, codMaxOrderMinor: 500_000, codFeeMinor: 0, shippingFlatMinor: 0 });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    adminId = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("keeps a bag against a token and refuses more than is in stock", async () => {
    const v = await createVariant(db, { onHand: 2, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    expect(bag.newToken).toBeTruthy();
    expect((await openBag(db, bag.newToken)).id).toBe(bag.id);

    await addToBag(db, bag.id, v.id);
    await addToBag(db, bag.id, v.id);
    const err = await addToBag(db, bag.id, v.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BagError);
    expect(err).toMatchObject({ code: "not_enough", available: 2 });

    const read = await readBag(db, bag.id);
    expect(read).toMatchObject({ count: 2, subtotalMinor: 699_800, hasProblems: false });
    await setLineQuantity(db, bag.id, read.lines[0]!.id, 1);
    expect((await readBag(db, bag.id)).count).toBe(1);

    const draft = await createVariant(db, { onHand: 1, status: "draft" });
    await expect(addToBag(db, bag.id, draft.id)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("places a COD order: prices from the database, stock taken, collection due, bag emptied", async () => {
    await settings({ shippingFlatMinor: 9_900, freeShippingThresholdMinor: 1_000_000, codFeeMinor: 5_000, codMaxOrderMinor: 1_000_000 });
    const v = await createVariant(db, { onHand: 3, priceMinor: 349_900 });
    const bagId = await bagWith(v.id, 2);

    const placed = await placeCodOrder(db, bagId, buyer());
    expect(placed.orderNumber).toMatch(/^AST-\d{6}$/);
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(order).toMatchObject({
      orderStatus: "confirmed",
      paymentMethod: "cod",
      paymentStatus: "unpaid",
      subtotalMinor: 699_800,
      shippingMinor: 9_900,
      codFeeMinor: 5_000,
      totalMinor: 714_700,
      contactPhone: "9812345678",
    });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, placed.orderId));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 2, unitPriceMinor: 349_900, lineTotalMinor: 699_800 });

    expect(await onHand(db, v.id)).toBe(1);
    expect(await movementSum(db, v.id)).toBe(1);
    const [cod] = await db.select().from(codCollections).where(eq(codCollections.orderId, placed.orderId));
    expect(cod).toMatchObject({ amountDueMinor: 714_700, status: "pending" });
    expect(await db.select().from(emailOutbox)).toHaveLength(1);
    expect((await readBag(db, bagId)).count).toBe(0);
  });

  it("a double tap places one order", async () => {
    const v = await createVariant(db, { onHand: 2 });
    const bagId = await bagWith(v.id);
    const input = buyer();
    const [a, b] = await Promise.all([placeCodOrder(db, bagId, input), placeCodOrder(db, bagId, input)]);
    expect(a.orderId).toBe(b.orderId);
    expect([a.repeated, b.repeated].sort()).toEqual([false, true]);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await onHand(db, v.id)).toBe(1);
  });

  it("two buyers for the last piece: exactly one gets it", async () => {
    const v = await createVariant(db, { onHand: 1 });
    const bags = [await bagWith(v.id), await bagWith(v.id)];
    const results = await Promise.allSettled(bags.map((b, i) => placeCodOrder(db, b, buyer({ phone: `981234567${i}` }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "unavailable", variantIds: [v.id] });
    expect(await onHand(db, v.id)).toBe(0);
    expect(await db.select().from(orders)).toHaveLength(1);
    // The loser's bag is untouched, and now shows the line as sold out.
    const loserBag = bags[results.findIndex((r) => r.status === "rejected")]!;
    expect((await readBag(db, loserBag)).hasProblems).toBe(true);
  });

  it("follows the store's rules for cash on delivery", async () => {
    const v = await createVariant(db, { onHand: 5, priceMinor: 300_000 });

    await settings({ orderingOpen: false });
    await expectCheckout(placeCodOrder(db, await bagWith(v.id), buyer()), "ordering_closed");
    await settings({ orderingOpen: true, codEnabled: false });
    await expectCheckout(placeCodOrder(db, await bagWith(v.id), buyer()), "cod_off");
    await settings({ codEnabled: true });

    await expectCheckout(placeCodOrder(db, await bagWith(v.id, 2), buyer()), "over_cod_limit");
    await expectCheckout(placeCodOrder(db, (await openBag(db, null)).id, buyer()), "empty");

    await settings({ restrictToListedPincodes: true });
    await expectCheckout(placeCodOrder(db, await bagWith(v.id), buyer()), "pincode");
    await settings({ restrictToListedPincodes: false });

    // Hidden after it went into the bag.
    const hiddenBag = await bagWith(v.id);
    await db.update(products).set({ status: "archived" });
    await expectCheckout(placeCodOrder(db, hiddenBag, buyer()), "unavailable");
    await db.update(products).set({ status: "active" });

    // Two orders waiting for Krishna's check on one number; a third waits until one is checked.
    const first = await placeCodOrder(db, await bagWith(v.id), buyer());
    await placeCodOrder(db, await bagWith(v.id), buyer());
    await expectCheckout(placeCodOrder(db, await bagWith(v.id), buyer()), "too_many_unverified");
    await markCodVerified(db, first.orderId, adminId);
    await placeCodOrder(db, await bagWith(v.id), buyer());
  });

  it("cancelling puts the stock back once and closes the collection", async () => {
    const v = await createVariant(db, { onHand: 2 });
    const placed = await placeCodOrder(db, await bagWith(v.id, 2), buyer());
    expect(await onHand(db, v.id)).toBe(0);

    await expect(cancelOrder(db, placed.orderId, adminId, " ")).rejects.toBeInstanceOf(OrderRuleError);
    await Promise.allSettled([
      cancelOrder(db, placed.orderId, adminId, "Buyer changed her mind"),
      cancelOrder(db, placed.orderId, adminId, "Buyer changed her mind"),
    ]);
    expect(await onHand(db, v.id)).toBe(2);
    expect(await movementSum(db, v.id)).toBe(2);
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(order).toMatchObject({ orderStatus: "cancelled", cancelReason: "Buyer changed her mind" });
    const [cod] = await db.select().from(codCollections).where(eq(codCollections.orderId, placed.orderId));
    expect(cod!.status).toBe("failed");
    await expect(markCodVerified(db, placed.orderId, adminId)).rejects.toBeInstanceOf(OrderRuleError);
  });
});
