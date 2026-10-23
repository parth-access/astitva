/**
 * The bag: the chosen pieces, kept on the server. A guest's bag is found by a
 * random cookie token (only its SHA-256 is stored); no account needed. A
 * signed-in customer's bag belongs to the account instead, so it follows them
 * to every device. Signing in brings the guest bag on that device into the
 * account's (see claimGuestBag); signing out leaves the account's bag behind.
 *
 * Adding a piece does not hold stock: it is checked when added and again,
 * under lock, at checkout. Holding stock for bags would lock pieces away
 * from people who are actually buying.
 *
 * Storefront code: never selects supplier, cost or internal ref.
 * Framework-free (takes a db handle) so tests can drive it directly.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/create";
import { cartItems, carts, productImages, productVariants, products, users } from "@/db/schema";
import { getAvailability } from "@/modules/inventory/service";
import { EMPTY_BAG, lineProblem, MAX_PER_LINE, type Bag, type BagLine } from "./types";

export { EMPTY_BAG, lineProblem, MAX_PER_LINE, type Bag, type BagLine } from "./types";

export const BAG_COOKIE = "astitva_bag";
export const BAG_DAYS = 30;

export type BagErrorCode = "unavailable" | "not_enough" | "limit" | "not_found";

export class BagError extends Error {
  constructor(
    readonly code: BagErrorCode,
    readonly available = 0,
  ) {
    super(`Bag: ${code}`);
    this.name = "BagError";
  }
}

export function newBagToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashBagToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const live = sql`now()`;
const extended = () => sql`now() + make_interval(days => ${BAG_DAYS})`;

/** The guest bag for a cookie token, if it exists and hasn't lapsed. Never an account's bag. */
export async function findBag(db: DbOrTx, token: string | null | undefined): Promise<{ id: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.guestTokenHash, hashBagToken(token)), isNull(carts.userId), gt(carts.expiresAt, live)));
  return row ?? null;
}

/**
 * The visitor's guest bag, made on first use. Each use pushes its expiry another
 * BAG_DAYS out. Returns a new token when a bag was made (set it as the cookie).
 */
export async function openBag(db: DbOrTx, token: string | null | undefined): Promise<{ id: string; newToken: string | null }> {
  const existing = await findBag(db, token);
  if (existing) {
    await db.update(carts).set({ expiresAt: extended() }).where(eq(carts.id, existing.id));
    return { id: existing.id, newToken: null };
  }
  const fresh = newBagToken();
  const [row] = await db.insert(carts).values({ guestTokenHash: hashBagToken(fresh), expiresAt: extended() }).returning({ id: carts.id });
  return { id: row!.id, newToken: fresh };
}

/** A customer's bag, if they have one that hasn't lapsed. */
export async function findAccountBag(db: DbOrTx, userId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.userId, userId), gt(carts.expiresAt, live)))
    .orderBy(desc(carts.expiresAt))
    .limit(1);
  return row ?? null;
}

/** A customer's bag, made on first use; each use pushes its expiry out, as for guests. */
export async function openAccountBag(db: Db, userId: string): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // One at a time per customer, so two first adds make one bag.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const existing = await findAccountBag(tx, userId);
    if (existing) {
      await tx.update(carts).set({ expiresAt: extended() }).where(eq(carts.id, existing.id));
      return existing;
    }
    const [row] = await tx.insert(carts).values({ userId, expiresAt: extended() }).returning({ id: carts.id });
    return row!;
  });
}

/**
 * Brings this device's guest bag into the customer's account. With no account
 * bag yet, the guest bag becomes it. Otherwise its lines join the account's
 * (the same colour and size adds up, to MAX_PER_LINE) and the guest bag goes.
 * Stock isn't checked here: the bag shows what has sold, as it always does.
 * Returns whether there was a guest bag to bring.
 */
export async function claimGuestBag(db: Db, token: string | null | undefined, userId: string): Promise<boolean> {
  if (!token) return false;
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [guest] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(and(eq(carts.guestTokenHash, hashBagToken(token)), isNull(carts.userId), gt(carts.expiresAt, live)))
      .for("update");
    if (!guest) return false;

    const account = await findAccountBag(tx, userId);
    if (!account) {
      // No token any more: from now on only the account finds it.
      await tx.update(carts).set({ userId, guestTokenHash: null, expiresAt: extended() }).where(eq(carts.id, guest.id));
      return true;
    }
    const lines = await tx.select({ variantId: cartItems.variantId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.cartId, guest.id));
    if (lines.length) {
      await tx
        .insert(cartItems)
        .values(lines.map((l) => ({ cartId: account.id, variantId: l.variantId, quantity: Math.min(l.quantity, MAX_PER_LINE) })))
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.variantId],
          set: { quantity: sql`least(${cartItems.quantity} + excluded.quantity, ${MAX_PER_LINE})` },
        });
    }
    await tx.update(carts).set({ expiresAt: extended() }).where(eq(carts.id, account.id));
    await tx.delete(carts).where(eq(carts.id, guest.id));
    return true;
  });
}

/** The piece's first category, which picks its sketch. Outer table written out (see catalog/queries). */
const firstCategorySlug = sql<string | null>`(select c.slug from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = products.id order by c.sort_order limit 1)`;

export async function readBag(db: DbOrTx, bagId: string): Promise<Bag> {
  const rows = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      pieceName: products.pieceName,
      pieceNumber: products.pieceNumber,
      tone: products.tone,
      categorySlug: firstCategorySlug,
      productStatus: products.status,
      colour: productVariants.color,
      colourHex: productVariants.colorHex,
      size: productVariants.size,
      priceMinor: productVariants.priceMinor,
      isActive: productVariants.isActive,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartItems.cartId, bagId))
    .orderBy(asc(cartItems.createdAt));
  if (rows.length === 0) return EMPTY_BAG;

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const [available, images] = await Promise.all([
    getAvailability(
      db,
      rows.map((r) => r.variantId),
    ),
    db
      .select({ productId: productImages.productId, colour: productImages.color, url: productImages.url, alt: productImages.altText })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder)),
  ]);

  const lines = rows.map((r): BagLine => {
    // This colour's first photo, else a photo of every colour.
    const photo =
      images.find((i) => i.productId === r.productId && i.colour === r.colour) ??
      images.find((i) => i.productId === r.productId && !i.colour);
    return {
      id: r.id,
      variantId: r.variantId,
      slug: r.slug,
      name: r.name,
      pieceName: r.pieceName,
      pieceNumber: r.pieceNumber,
      categorySlug: r.categorySlug,
      colour: r.colour,
      colourHex: r.colourHex,
      tone: r.tone,
      size: r.size,
      imageUrl: photo?.url ?? null,
      imageAlt: photo?.alt || r.name,
      priceMinor: Number(r.priceMinor),
      quantity: r.quantity,
      available: available.get(r.variantId) ?? 0,
      onSale: r.isActive && r.productStatus === "active",
    };
  });

  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalMinor: lines.reduce((n, l) => n + l.priceMinor * l.quantity, 0),
    hasProblems: lines.some(lineProblem),
  };
}

async function onSaleAvailability(db: DbOrTx, variantId: string): Promise<number | null> {
  const [v] = await db
    .select({ isActive: productVariants.isActive, status: products.status })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId));
  if (!v || !v.isActive || v.status !== "active") return null;
  return (await getAvailability(db, [variantId])).get(variantId) ?? 0;
}

/** Add units of one colour and size; adds to the line if it is already in the bag. */
export async function addToBag(db: DbOrTx, bagId: string, variantId: string, quantity = 1): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new BagError("limit");
  const available = await onSaleAvailability(db, variantId);
  if (available === null) throw new BagError("unavailable");

  const [line] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, bagId), eq(cartItems.variantId, variantId)));
  const wanted = (line?.quantity ?? 0) + quantity;
  if (wanted > available) throw new BagError("not_enough", available);
  if (wanted > MAX_PER_LINE) throw new BagError("limit", MAX_PER_LINE);

  await db
    .insert(cartItems)
    .values({ cartId: bagId, variantId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    });
}

/** Set a line's quantity; 0 removes it. Going down is always allowed, going up only into stock. */
export async function setLineQuantity(db: DbOrTx, bagId: string, lineId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 0) throw new BagError("limit");
  if (quantity === 0) return removeLine(db, bagId, lineId);
  const [line] = await db
    .select({ variantId: cartItems.variantId, quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.id, lineId), eq(cartItems.cartId, bagId)));
  if (!line) throw new BagError("not_found");
  if (quantity > MAX_PER_LINE) throw new BagError("limit", MAX_PER_LINE);
  if (quantity > line.quantity) {
    const available = await onSaleAvailability(db, line.variantId);
    if (available === null) throw new BagError("unavailable");
    if (quantity > available) throw new BagError("not_enough", available);
  }
  await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, lineId), eq(cartItems.cartId, bagId)));
}

export async function removeLine(db: DbOrTx, bagId: string, lineId: string): Promise<void> {
  await db.delete(cartItems).where(and(eq(cartItems.id, lineId), eq(cartItems.cartId, bagId)));
}
