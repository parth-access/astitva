import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminRoleAssignments, authSessions, customerAddresses, orderItems, orders, stockAlerts, users } from "../../src/db/schema";
import type { AddressInput } from "../../src/modules/account/input";
import {
  AccountError,
  deleteAccount,
  deleteAddress,
  listAccountOrders,
  listAddresses,
  MAX_ADDRESSES,
  saveAddress,
  setDefaultAddress,
  updateDetails,
} from "../../src/modules/account/service";
import { safeNext } from "../../src/modules/auth/customer-config";
import { isOrderLinkKey } from "../../src/modules/orders/links";
import { createVariant, hasDb, makeDb, resetData } from "./helpers";

const SECRET = "test-secret-test-secret-test-secret-123";

const home: AddressInput = {
  name: "Meera Rao",
  phone: "9812345678",
  line1: "12 Lake Road",
  line2: null,
  landmark: null,
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
};

describe("safe return paths", () => {
  it("only goes back to our own pages", () => {
    expect(safeNext("/account/addresses")).toBe("/account/addresses");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext(undefined)).toBe("/account");
  });
});

describe.skipIf(!hasDb)("customer accounts", () => {
  const db = makeDb(4);

  async function customer(email: string) {
    const [u] = await db.insert(users).values({ name: "Meera", email, emailVerified: true }).returning();
    return u!;
  }

  async function order(opts: { email?: string | null; userId?: string | null; method?: "cod" | "online"; paid?: boolean; items?: string[] }) {
    const method = opts.method ?? "cod";
    const [o] = await db
      .insert(orders)
      .values({
        userId: opts.userId ?? null,
        contactName: "Meera",
        contactEmail: opts.email ?? null,
        contactPhone: "9812345678",
        orderStatus: method === "cod" ? "confirmed" : opts.paid ? "confirmed" : "pending_payment",
        paymentStatus: opts.paid ? "paid" : "unpaid",
        paymentMethod: method,
        subtotalMinor: 200_000,
        totalMinor: 200_000,
        addressSnapshot: { recipientName: "Meera", phone: "9812345678", line1: "12 Lake Road", city: "Pune", state: "Maharashtra", pincode: "411001", countryCode: "IN" },
        idempotencyScope: "test",
        idempotencyKey: randomUUID(),
      })
      .returning();
    for (const name of opts.items ?? ["Neem"]) {
      await db.insert(orderItems).values({ orderId: o!.id, productNameSnapshot: name, skuSnapshot: "SKU", variantSnapshot: {}, quantity: 1, unitPriceMinor: 200_000, lineTotalMinor: 200_000 });
    }
    return o!;
  }

  beforeEach(async () => {
    await resetData(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("lists the customer's orders: their own, and guest orders with their email, never anyone else's", async () => {
    const meera = await customer("meera@example.com");
    const guest = await order({ email: "Meera@Example.com", items: ["Neem", "Ink", "Rust"] });
    const signedIn = await order({ userId: meera.id, email: null });
    await order({ email: "tara@example.com" });
    // A guest order with her email that belongs to someone else's account stays theirs.
    const tara = await customer("tara@example.com");
    await order({ userId: tara.id, email: "meera@example.com" });
    // An online checkout nobody paid for isn't an order.
    await order({ email: "meera@example.com", method: "online", paid: false });
    const paidOnline = await order({ email: "meera@example.com", method: "online", paid: true });

    const list = await listAccountOrders(db, { userId: meera.id, email: "meera@example.com" }, SECRET);
    expect(list.map((o) => o.number).sort()).toEqual([guest.orderNumber, signedIn.orderNumber, paidOnline.orderNumber].sort());
    const g = list.find((o) => o.number === guest.orderNumber)!;
    // The first line as the order page lists it, then a count.
    expect(g.summary).toMatch(/^(Neem|Ink|Rust) and 2 more$/);
    expect(g.totalMinor).toBe(200_000);
    const key = new URL(g.href, "http://x").searchParams.get("k");
    expect(isOrderLinkKey(guest.id, key, SECRET)).toBe(true);
  });

  it("keeps one address first, and moves it when asked or when it's removed", async () => {
    const { id } = await customer("meera@example.com");
    const a = await saveAddress(db, id, home);
    expect(a.isDefault).toBe(true);
    const b = await saveAddress(db, id, { ...home, line1: "4 Hill Street" });
    expect(b.isDefault).toBe(false);

    await setDefaultAddress(db, id, b.id);
    expect((await listAddresses(db, id)).map((x) => [x.line1, x.isDefault])).toEqual([
      ["4 Hill Street", true],
      ["12 Lake Road", false],
    ]);

    const c = await saveAddress(db, id, { ...home, line1: "9 River Lane" });
    await saveAddress(db, id, { ...home, id: c.id, line1: "9 River Lane, flat 2", makeDefault: true });
    const after = await listAddresses(db, id);
    expect(after.filter((x) => x.isDefault).map((x) => x.line1)).toEqual(["9 River Lane, flat 2"]);

    await deleteAddress(db, id, c.id);
    expect((await listAddresses(db, id)).filter((x) => x.isDefault)).toHaveLength(1);
  });

  it("holds at most ten addresses, and never touches another customer's", async () => {
    const meera = await customer("meera@example.com");
    const tara = await customer("tara@example.com");
    for (let i = 0; i < MAX_ADDRESSES; i++) await saveAddress(db, meera.id, { ...home, line1: `${i} Lake Road` });
    await expect(saveAddress(db, meera.id, home)).rejects.toEqual(new AccountError("too_many_addresses"));

    const [hers] = await listAddresses(db, meera.id);
    await expect(saveAddress(db, tara.id, { ...home, id: hers!.id, line1: "Taken" })).rejects.toEqual(new AccountError("not_found"));
    await expect(deleteAddress(db, tara.id, hers!.id)).rejects.toEqual(new AccountError("not_found"));
    await expect(setDefaultAddress(db, tara.id, hers!.id)).rejects.toEqual(new AccountError("not_found"));
    expect(await listAddresses(db, meera.id)).toHaveLength(MAX_ADDRESSES);
  });

  it("forgets that a mobile was proved when it changes", async () => {
    const { id } = await customer("meera@example.com");
    await db.update(users).set({ phone: "9812345678", phoneVerified: true }).where(eq(users.id, id));
    await updateDetails(db, id, { name: "Meera Rao", phone: "9812345678" });
    expect((await db.select().from(users).where(eq(users.id, id)))[0]).toMatchObject({ name: "Meera Rao", phoneVerified: true });
    await updateDetails(db, id, { name: "Meera Rao", phone: "9800000000" });
    expect((await db.select().from(users).where(eq(users.id, id)))[0]).toMatchObject({ phone: "9800000000", phoneVerified: false });
  });

  it("deletes an account and what hangs off it, keeping the orders without it", async () => {
    const meera = await customer("meera@example.com");
    await saveAddress(db, meera.id, home);
    await db.insert(authSessions).values({ userId: meera.id, token: randomUUID(), expiresAt: new Date(Date.now() + 60_000), kind: "customer" });
    const placed = await order({ userId: meera.id, email: "meera@example.com" });
    const v = await createVariant(db, { onHand: 0 });
    await db.insert(stockAlerts).values({ variantId: v.id, email: "Meera@example.com" });

    await deleteAccount(db, meera.id);
    expect(await db.select().from(users).where(eq(users.id, meera.id))).toEqual([]);
    expect(await db.select().from(authSessions)).toEqual([]);
    expect(await db.select().from(customerAddresses)).toEqual([]);
    expect(await db.select().from(stockAlerts)).toEqual([]);
    const [kept] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(kept?.userId).toBeNull();
  });

  it("won't delete an admin", async () => {
    const krishna = await customer("krishna@example.com");
    await db.insert(adminRoleAssignments).values({ userId: krishna.id, role: "owner" });
    await expect(deleteAccount(db, krishna.id)).rejects.toEqual(new AccountError("not_found"));
  });
});
