/**
 * The bag: a guest's chosen pieces, kept on the server against a random
 * cookie token (only its SHA-256 is stored). No account needed.
 *
 * Adding a piece does not hold stock: it is checked when added and again,
 * under lock, at checkout. Holding stock for bags would lock pieces away
 * from people who are actually buying.
 *
 * Storefront code: never selects supplier, cost or internal ref.
 * Framework-free (takes a db handle) so tests can drive it directly.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { cartItems, carts, productImages, productVariants, products } from "@/db/schema";
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

/** The bag for a cookie token, if it exists and hasn't lapsed. */
export async function findBag(db: DbOrTx, token: string | null | undefined): Promise<{ id: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.guestTokenHash, hashBagToken(token)), gt(carts.expiresAt, sql`now()`)));
  return row ?? null;
}

/**
 * The visitor's bag, made on first use. Each use pushes its expiry another
 * BAG_DAYS out. Returns a new token when a bag was made (set it as the cookie).
 */
export async function openBag(db: DbOrTx, token: string | null | undefined): Promise<{ id: string; newToken: string | null }> {
  const existing = await findBag(db, token);
  const expiresAt = sql`now() + make_interval(days => ${BAG_DAYS})`;
  if (existing) {
    await db.update(carts).set({ expiresAt }).where(eq(carts.id, existing.id));
    return { id: existing.id, newToken: null };
  }
  const fresh = newBagToken();
  const [row] = await db.insert(carts).values({ guestTokenHash: hashBagToken(fresh), expiresAt }).returning({ id: carts.id });
  return { id: row!.id, newToken: fresh };
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
