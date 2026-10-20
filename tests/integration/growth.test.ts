import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { discountCodes, emailOutbox, orderItems, orders, stockAlerts, storeSettings, users } from "../../src/db/schema";
import type { Email } from "../../src/lib/email";
import { notifyRestocked, subscribeToRestock } from "../../src/modules/alerts/service";
import { addToBag, openBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { CheckoutError, placeOrder } from "../../src/modules/checkout/service";
import { checkCode, createCode } from "../../src/modules/discounts/service";
import { processOutbox } from "../../src/modules/email/outbox";
import { adjustStock } from "../../src/modules/inventory/service";
import { normaliseOrderNumber, requestOrderLink } from "../../src/modules/orders/lookup";
import { cancelOrder } from "../../src/modules/orders/service";
import { createVariant, hasDb, makeDb, resetData } from "./helpers";

const ctx = { appUrl: "https://astitva.test", linkSecret: "s".repeat(32) };

function buyer(opts: { phone?: string; email?: string | null; code?: string; method?: "cod" | "online" } = {}): CheckoutInput {
  const phone = opts.phone ?? "9812345678";
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone, email: opts.email === undefined ? "asha@example.com" : opts.email },
    address: { recipientName: "Asha Rao", phone, line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
    paymentMethod: opts.method ?? "cod",
    discountCode: opts.code ?? null,
  };
}

describe.skipIf(!hasDb)("find my order, back-in-stock alerts, discount codes", () => {
  const db = makeDb(8);
  let admin: string;

  async function placed(opts: Parameters<typeof buyer>[0] & { units?: number; price?: number; quantity?: number } = {}) {
    const v = await createVariant(db, { onHand: opts.units ?? 5, priceMinor: opts.price ?? 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id, opts.quantity ?? 1);
    return { v, ...(await placeOrder(db, bag.id, buyer(opts))) };
  }
  const uses = async (code: string) => (await db.select().from(discountCodes).where(eq(discountCodes.code, code)))[0]!.usesCount;
  const newCode = (over: Partial<Parameters<typeof createCode>[1]> = {}) =>
    createCode(db, { code: "LAUNCH10", kind: "percent", value: 1000, minSubtotalMinor: 0, startsAt: null, endsAt: null, maxUses: null, onePerPhone: true, note: null, ...over }, admin);

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, codEnabled: true, codMaxOrderMinor: 5_000_000 });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    admin = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  describe("find my order", () => {
    it("reads order numbers however they're typed", () => {
      expect(normaliseOrderNumber("1004")).toBe("AST-001004");
      expect(normaliseOrderNumber("ast-001004")).toBe("AST-001004");
      expect(normaliseOrderNumber(" AST 1004 ")).toBe("AST-001004");
      expect(normaliseOrderNumber("1234567")).toBeNull();
      expect(normaliseOrderNumber("hello")).toBeNull();
    });

    it("emails the link only when number and phone match, at most once an hour", async () => {
      const o = await placed();
      expect(await requestOrderLink(db, { orderNumber: o.orderNumber, phone: "9899999999" })).toBe("no_match");
      expect(await requestOrderLink(db, { orderNumber: o.orderNumber.replace("AST-", ""), phone: "+91 98123 45678" })).toBe("emailed");
      expect(await requestOrderLink(db, { orderNumber: o.orderNumber, phone: "9812345678" })).toBe("emailed");
      const links = (await db.select().from(emailOutbox)).filter((r) => r.template === "order_link");
      expect(links).toHaveLength(1);

      const sent: Email[] = [];
      await processOutbox(db, async (e) => void sent.push(e), ctx);
      const mail = sent.find((e) => e.subject === `Your Astitva order ${o.orderNumber}` && e.text.includes("You asked for the page"))!;
      expect(mail.text).toMatch(new RegExp(`https://astitva.test/orders/${o.orderNumber}\\?k=`));

      const noEmail = await placed({ phone: "9811111111", email: null });
      expect(await requestOrderLink(db, { orderNumber: noEmail.orderNumber, phone: "9811111111" })).toBe("no_email");
    });
  });

  describe("back in stock", () => {
    it("takes sign-ups only for sold-out pieces, once per person, and emails each once when stock returns", async () => {
      const v = await createVariant(db, { onHand: 0, priceMinor: 349_900 });
      expect(await subscribeToRestock(db, v.id, "not-an-email")).toBe("invalid_email");
      expect(await subscribeToRestock(db, v.id, "Asha@Example.com")).toBe("subscribed");
      expect(await subscribeToRestock(db, v.id, "asha@example.com")).toBe("already");
      expect(await subscribeToRestock(db, v.id, "meera@example.com")).toBe("subscribed");

      expect(await notifyRestocked(db)).toBe(0); // still sold out
      await db.transaction((tx) => adjustStock(tx, { variantId: v.id, delta: 2, type: "receipt", reason: "More arrived" }));
      const [first, second] = await Promise.all([notifyRestocked(db), notifyRestocked(db)]);
      expect(first + second).toBe(2);
      expect(await notifyRestocked(db)).toBe(0);

      const sent: Email[] = [];
      await processOutbox(db, async (e) => void sent.push(e), ctx);
      expect(sent.map((e) => e.to).sort()).toEqual(["asha@example.com", "meera@example.com"]);
      expect(sent[0]!.text).toContain("is back in stock");
      expect((await db.select().from(stockAlerts)).every((a) => a.notifiedAt !== null)).toBe(true);

      // In stock now: no sign-up needed. Sold out again: they can ask again.
      expect(await subscribeToRestock(db, v.id, "asha@example.com")).toBe("in_stock");
      await db.transaction((tx) => adjustStock(tx, { variantId: v.id, delta: -2, type: "adjustment", reason: "Count was high" }));
      expect(await subscribeToRestock(db, v.id, "asha@example.com")).toBe("subscribed");
    });

    it("refuses pieces that aren't offered", async () => {
      const draft = await createVariant(db, { onHand: 0, status: "draft" });
      expect(await subscribeToRestock(db, draft.id, "asha@example.com")).toBe("unavailable");
    });
  });

  describe("discount codes", () => {
    it("takes the discount off the pieces, spreads it over the lines, and records the code", async () => {
      await newCode();
      const v1 = await createVariant(db, { onHand: 3, priceMinor: 349_900 });
      const v2 = await createVariant(db, { onHand: 3, priceMinor: 199_900 });
      const bag = await openBag(db, null);
      await addToBag(db, bag.id, v1.id);
      await addToBag(db, bag.id, v2.id);
      const o = await placeOrder(db, bag.id, buyer({ code: " launch10 " }));
      const [order] = await db.select().from(orders).where(eq(orders.id, o.orderId));
      expect(order).toMatchObject({ subtotalMinor: 549_800, discountMinor: 55_000, totalMinor: 494_800, discountCode: "LAUNCH10" });
      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o.orderId));
      expect(lines.reduce((n, l) => n + Number(l.discountMinor), 0)).toBe(55_000);
      expect(lines.reduce((n, l) => n + Number(l.lineTotalMinor), 0)).toBe(494_800);
      expect(await uses("LAUNCH10")).toBe(1);
    });

    it("checks dates, minimums, limits and one use per number", async () => {
      await newCode({ code: "EARLY", startsAt: new Date(Date.now() + 86_400_000) });
      await newCode({ code: "OVER", endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 86_400_000) });
      await newCode({ code: "BIG", kind: "amount", value: 50_000, minSubtotalMinor: 500_000 });
      const at = (code: string, subtotalMinor = 349_900, phone: string | null = null) => checkCode(db, code, { subtotalMinor, phone });
      expect(await at("nope")).toMatchObject({ ok: false, message: "That code isn't valid." });
      expect(await at("early")).toMatchObject({ ok: false, message: "That code isn't active yet." });
      expect(await at("over")).toMatchObject({ ok: false, message: "That code has expired." });
      expect(await at("big")).toMatchObject({ ok: false, message: "That code needs pieces worth at least ₹5,000." });
      expect(await at("big", 600_000)).toMatchObject({ ok: true, label: "₹500 off" });

      await newCode({ code: "ONCE" });
      await placed({ code: "ONCE" });
      expect(await at("once", 349_900, "9812345678")).toMatchObject({ ok: false, message: "That code has already been used with this mobile number." });
      const err = await placed({ code: "ONCE" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CheckoutError);
      expect(err).toMatchObject({ code: "discount", detail: "That code has already been used with this mobile number." });
      expect(await uses("ONCE")).toBe(1);
    });

    it("a limited code can't be overused by buyers racing, and cancelled orders give their use back", async () => {
      await newCode({ code: "TWO", maxUses: 2, onePerPhone: false });
      const results = await Promise.allSettled(
        ["9811111111", "9822222222", "9833333333", "9844444444"].map((phone) => placed({ code: "TWO", phone })),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(await uses("TWO")).toBe(2);
      expect(await checkCode(db, "TWO", { subtotalMinor: 349_900, phone: null })).toMatchObject({ ok: false, message: "That code has been used up." });

      const won = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof placed>>>;
      await cancelOrder(db, won.value.orderId, admin, "Buyer asked");
      expect(await uses("TWO")).toBe(1);
      expect(await checkCode(db, "TWO", { subtotalMinor: 349_900, phone: null })).toMatchObject({ ok: true });
    });

    it("starting checkout again from the same bag gives the earlier unpaid order's use back", async () => {
      await newCode({ code: "ONLINE", maxUses: 1 });
      const v = await createVariant(db, { onHand: 2, priceMinor: 349_900 });
      const bag = await openBag(db, null);
      await addToBag(db, bag.id, v.id);
      await placeOrder(db, bag.id, buyer({ code: "ONLINE", method: "online" }));
      expect(await uses("ONLINE")).toBe(1);
      await placeOrder(db, bag.id, buyer({ code: "ONLINE", method: "online" }));
      expect(await uses("ONLINE")).toBe(1);
      const live = await db.execute(sql`select count(*)::int as n from orders where discount_code = 'ONLINE' and order_status <> 'cancelled'`);
      expect(live.rows[0]).toEqual({ n: 1 });
    });
  });
});
