/**
 * A customer's account: their orders, saved addresses and details, and
 * deleting it all. Framework-free (the database is passed in) so tests can
 * call it; the pages and actions in src/app/(store)/account check who is
 * signed in and pass their id.
 *
 * Orders are found by the account, or by the account's email for orders
 * placed as a guest, but only once that email is verified (a code, or
 * Google): anyone can sign up with any email and a password. Phone numbers
 * aren't proved yet, so they find nothing.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/create";
import { auditLogs, customerAddresses, orderItems, orders, stockAlerts, users, type AddressSnapshot } from "@/db/schema";
import { isAdminUser } from "@/modules/auth/kinds";
import { orderLinkKey, orderPath } from "@/modules/orders/links";
import type { AddressInput, DetailsInput } from "./input";

export const MAX_ADDRESSES = 10;

export class AccountError extends Error {
  constructor(public readonly reason: "too_many_addresses" | "not_found") {
    super(reason);
  }
}

export type AccountOrder = {
  number: string;
  placedAt: Date;
  status: (typeof orders.$inferSelect)["orderStatus"];
  paymentMethod: "cod" | "online";
  totalMinor: number;
  /** "Neem", or "Neem and 2 more". */
  summary: string;
  /** The order's private page. */
  href: string;
};

/** `email` only when it's verified; null finds just the orders placed signed in. */
export type Owner = { userId: string; email: string | null };

/** Orders that are the customer's: placed signed in, or as a guest with their verified email. */
function ownedBy(owner: Owner) {
  if (!owner.email) return eq(orders.userId, owner.userId);
  return or(eq(orders.userId, owner.userId), and(isNull(orders.userId), sql`lower(${orders.contactEmail}) = ${owner.email.toLowerCase()}`));
}

/**
 * Newest first. Leaves out online checkouts that were never paid: those
 * were never really orders, and the buyer was told so at the time.
 */
export async function listAccountOrders(db: DbOrTx, owner: Owner, secret: string): Promise<AccountOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      number: orders.orderNumber,
      placedAt: orders.createdAt,
      status: orders.orderStatus,
      paymentMethod: orders.paymentMethod,
      totalMinor: orders.totalMinor,
    })
    .from(orders)
    .where(and(ownedBy(owner), or(eq(orders.paymentMethod, "cod"), ne(orders.paymentStatus, "unpaid"))))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  if (rows.length === 0) return [];

  const items = await db
    .select({ orderId: orderItems.orderId, name: orderItems.productNameSnapshot })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .orderBy(asc(orderItems.id));
  const names = new Map<string, string[]>();
  for (const i of items) names.set(i.orderId, [...(names.get(i.orderId) ?? []), i.name]);

  return rows.map(({ id, ...r }) => {
    const n = names.get(id) ?? [];
    const summary = n.length <= 1 ? (n[0] ?? "Your order") : `${n[0]} and ${n.length - 1} more`;
    return { ...r, totalMinor: Number(r.totalMinor), summary, href: orderPath(r.number, orderLinkKey(id, secret)) };
  });
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export type SavedAddress = typeof customerAddresses.$inferSelect;

/** The default first, then the newest. */
export async function listAddresses(db: DbOrTx, userId: string): Promise<SavedAddress[]> {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.userId, userId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));
}

const columns = (a: AddressInput) => ({
  recipientName: a.name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
});

/**
 * Adds an address, or changes one of the customer's own (`id`). The first
 * address is the default; `makeDefault` moves the default to this one.
 */
export async function saveAddress(db: Db, userId: string, input: AddressInput & { id?: string | null; makeDefault?: boolean }): Promise<SavedAddress> {
  return db.transaction(async (tx) => {
    // One customer's address changes run one at a time, so the count and the default stay right.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const existing = await tx.select({ id: customerAddresses.id, isDefault: customerAddresses.isDefault }).from(customerAddresses).where(eq(customerAddresses.userId, userId));

    if (input.id && !existing.some((a) => a.id === input.id)) throw new AccountError("not_found");
    if (!input.id && existing.length >= MAX_ADDRESSES) throw new AccountError("too_many_addresses");

    // The first address, or any address while none is the default, becomes it.
    const makeDefault = input.makeDefault === true || !existing.some((a) => a.isDefault);
    if (makeDefault) {
      await tx.update(customerAddresses).set({ isDefault: false }).where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.isDefault, true)));
    }

    if (input.id) {
      const [row] = await tx
        .update(customerAddresses)
        .set({ ...columns(input), ...(makeDefault ? { isDefault: true } : {}) })
        .where(and(eq(customerAddresses.id, input.id), eq(customerAddresses.userId, userId)))
        .returning();
      return row!;
    }
    const [row] = await tx
      .insert(customerAddresses)
      .values({ userId, ...columns(input), isDefault: makeDefault })
      .returning();
    return row!;
  });
}

export async function setDefaultAddress(db: Db, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [mine] = await tx.select({ id: customerAddresses.id }).from(customerAddresses).where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, userId)));
    if (!mine) throw new AccountError("not_found");
    await tx.update(customerAddresses).set({ isDefault: false }).where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.isDefault, true)));
    await tx.update(customerAddresses).set({ isDefault: true }).where(eq(customerAddresses.id, id));
  });
}

/** Removes one of the customer's addresses. If it was the default, the newest left takes over. */
export async function deleteAddress(db: Db, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [gone] = await tx
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.userId, userId)))
      .returning({ isDefault: customerAddresses.isDefault });
    if (!gone) throw new AccountError("not_found");
    if (!gone.isDefault) return;
    const [next] = await tx.select({ id: customerAddresses.id }).from(customerAddresses).where(eq(customerAddresses.userId, userId)).orderBy(desc(customerAddresses.createdAt)).limit(1);
    if (next) await tx.update(customerAddresses).set({ isDefault: true }).where(eq(customerAddresses.id, next.id));
  });
}

/** A saved address as an order keeps it. */
export function toSnapshot(a: SavedAddress): AddressSnapshot {
  return {
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    ...(a.landmark ? { landmark: a.landmark } : {}),
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    countryCode: "IN",
  };
}

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

export type AccountDetails = { name: string; email: string; phone: string | null };

export async function getDetails(db: DbOrTx, userId: string): Promise<AccountDetails | null> {
  const [row] = await db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, userId));
  return row ? { name: row.name, email: row.email ?? "", phone: row.phone } : null;
}

/** Name and mobile. A changed mobile isn't proved, so it finds no orders until it is. */
export async function updateDetails(db: DbOrTx, userId: string, input: DetailsInput): Promise<void> {
  const [current] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId));
  if (!current) throw new AccountError("not_found");
  await db
    .update(users)
    .set({ name: input.name, phone: input.phone, ...(input.phone !== current.phone ? { phoneVerified: false } : {}) })
    .where(eq(users.id, userId));
}

/**
 * Deletes the account: sign-ins, sessions, addresses, saved pieces and
 * back-in-stock alerts go. Orders stay, as the law requires for tax records,
 * but no longer point at the account. Admins can't be deleted here.
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).for("update");
    if (!user || (await isAdminUser(tx, userId))) throw new AccountError("not_found");
    if (user.email) await tx.delete(stockAlerts).where(sql`lower(${stockAlerts.email}) = ${user.email.toLowerCase()}`);
    // Cascades: sessions, sign-in methods, addresses, saved pieces. Orders and bags keep a null owner.
    await tx.delete(users).where(eq(users.id, userId));
    await tx.insert(auditLogs).values({ actorId: null, action: "customer.deleted", resourceType: "user", resourceId: userId, metadata: {} });
  });
}
