import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
  chapters,
  inventoryMovements,
  orderItems,
  orders,
  productCategories,
  productImages,
  productVariants,
  products,
  storeSettings,
} from "@/db/schema";
import type { Measurements } from "@/db/schema";
import { compareSizes } from "@/lib/sizes";

/**
 * Storefront reads. Content is cached and tagged "catalog"; admin edits and
 * committed sales call revalidateTag("catalog"). Live stock for the buy button
 * is read separately (uncached) on the piece page.
 *
 * Internal fields (supplier, acquisition cost, internal ref) are never selected here.
 */

export const CATALOG_TAG = "catalog";

export type ProductSort = "sequence" | "newest" | "price_asc" | "price_desc";
export const PRODUCT_SORTS: Record<ProductSort, string> = {
  sequence: "In order",
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
};

export type PieceCard = {
  id: string;
  slug: string;
  /** Plain description, e.g. "Taupe knit midi dress". */
  name: string;
  pieceNumber: number | null;
  pieceName: string | null;
  story: string | null;
  tone: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  imageUrl: string | null;
  imageAlt: string;
  onHand: number;
  variantCount: number;
};

const minPrice = sql<number>`min(${productVariants.priceMinor})::bigint`;

export async function listPieces(
  opts: { categorySlug?: string; chapterId?: string; sort?: ProductSort; featuredOnly?: boolean; limit?: number } = {},
) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const sort = opts.sort ?? "sequence";

  const categoryFilter = opts.categorySlug
    ? inArray(
        products.id,
        db
          .select({ id: productCategories.productId })
          .from(productCategories)
          .innerJoin(categories, eq(categories.id, productCategories.categoryId))
          .where(eq(categories.slug, opts.categorySlug)),
      )
    : undefined;

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      story: products.story,
      tone: products.tone,
      priceMinor: minPrice,
      compareAtMinor: sql<number | null>`max(${productVariants.compareAtMinor})::bigint`,
      onHand: sql<number>`sum(${productVariants.onHand})::int`,
      variantCount: sql<number>`count(${productVariants.id})::int`,
    })
    .from(products)
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
    .where(
      and(
        eq(products.status, "active"),
        opts.featuredOnly ? eq(products.isFeatured, true) : undefined,
        opts.chapterId ? eq(products.chapterId, opts.chapterId) : undefined,
        categoryFilter,
      ),
    )
    .groupBy(products.id)
    .orderBy(
      sort === "price_asc"
        ? asc(minPrice)
        : sort === "price_desc"
          ? desc(minPrice)
          : sort === "newest"
            ? desc(products.publishedAt)
            : sql`${products.pieceNumber} asc nulls last`,
      asc(products.name),
    )
    .limit(opts.limit ?? 200);

  const images = await firstImages(rows.map((r) => r.id));

  return rows.map(
    (r): PieceCard => ({
      ...r,
      priceMinor: Number(r.priceMinor),
      compareAtMinor: r.compareAtMinor === null ? null : Number(r.compareAtMinor),
      imageUrl: images.get(r.id)?.url ?? null,
      imageAlt: images.get(r.id)?.alt || r.name,
      onHand: Number(r.onHand),
      variantCount: Number(r.variantCount),
    }),
  );
}

async function firstImages(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { url: string; alt: string }>();
  const rows = await db
    .selectDistinctOn([productImages.productId], {
      productId: productImages.productId,
      url: productImages.url,
      alt: productImages.altText,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(productImages.productId, asc(productImages.sortOrder));
  return new Map(rows.map((r) => [r.productId, { url: r.url, alt: r.alt }]));
}

export async function listCategories() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(
      and(
        eq(categories.isActive, true),
        sql`exists (select 1 from ${productCategories} pc join ${products} p on p.id = pc.product_id
                    where pc.category_id = ${categories.id} and p.status = 'active')`,
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

const chapterColumns = {
  id: chapters.id,
  number: chapters.number,
  slug: chapters.slug,
  title: chapters.title,
  subtitle: chapters.subtitle,
  letter: chapters.letter,
  letterSignature: chapters.letterSignature,
  coverImageUrl: chapters.coverImageUrl,
  coverImageAlt: chapters.coverImageAlt,
  tone: chapters.tone,
  releaseAt: chapters.releaseAt,
  // Written out in full: inside a subquery Drizzle would render ${chapters.id} unqualified, which would bind to p.id.
  pieceCount: sql<number>`(select count(*)::int from products p where p.chapter_id = "chapters"."id" and p.status = 'active')`,
};

export type Chapter = NonNullable<Awaited<ReturnType<typeof getCurrentChapter>>>;

/** The newest published chapter: the one the homepage opens on. */
export async function getCurrentChapter() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const [row] = await db
    .select(chapterColumns)
    .from(chapters)
    .where(eq(chapters.status, "published"))
    .orderBy(desc(chapters.number))
    .limit(1);
  return row ?? null;
}

export async function getChapterBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const [row] = await db
    .select(chapterColumns)
    .from(chapters)
    .where(and(eq(chapters.slug, slug), eq(chapters.status, "published")));
  return row ?? null;
}

export async function listChapters() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return db
    .select({ number: chapters.number, slug: chapters.slug, title: chapters.title })
    .from(chapters)
    .where(eq(chapters.status, "published"))
    .orderBy(desc(chapters.number));
}

/* ------------------------------------------------------------------ */
/* Archive: pieces that have found their home                          */
/* ------------------------------------------------------------------ */

export type ArchivedPiece = {
  id: string;
  slug: string;
  name: string;
  pieceNumber: number | null;
  pieceName: string | null;
  tone: string | null;
  imageUrl: string | null;
  imageAlt: string;
  soldAt: Date;
  /** Only when the buyer opted in at checkout. */
  city: string | null;
};

/**
 * Published pieces with nothing left to sell that have actually been sold
 * (a piece that was merely never stocked is not "found its home").
 */
export async function listArchive(limit = 60) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const lastSale = sql<Date>`max(${inventoryMovements.createdAt})`;
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      tone: products.tone,
      soldAt: lastSale,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .innerJoin(
      inventoryMovements,
      and(eq(inventoryMovements.variantId, productVariants.id), eq(inventoryMovements.movementType, "sale")),
    )
    .where(eq(products.status, "active"))
    .groupBy(products.id)
    .having(
      sql`(select coalesce(sum(v.on_hand), 0) from ${productVariants} v where v.product_id = ${products.id} and v.is_active) = 0`,
    )
    .orderBy(desc(lastSale))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const [images, cities] = await Promise.all([firstImages(ids), consentedCities(ids)]);

  return rows.map(
    (r): ArchivedPiece => ({
      ...r,
      soldAt: new Date(r.soldAt),
      imageUrl: images.get(r.id)?.url ?? null,
      imageAlt: images.get(r.id)?.alt || r.name,
      city: cities.get(r.id) ?? null,
    }),
  );
}

/** City of the most recent non-cancelled order for each product, where the buyer agreed to share it. */
async function consentedCities(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, string>();
  const rows = await db
    .selectDistinctOn([productVariants.productId], {
      productId: productVariants.productId,
      city: sql<string | null>`${orders.addressSnapshot}->>'city'`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        inArray(productVariants.productId, productIds),
        eq(orders.shareCityInArchive, true),
        sql`${orders.orderStatus} <> 'cancelled'`,
        isNotNull(orderItems.variantId),
      ),
    )
    .orderBy(productVariants.productId, desc(orders.createdAt));
  return new Map(rows.filter((r) => r.city).map((r) => [r.productId, r.city!]));
}

/* ------------------------------------------------------------------ */
/* Piece detail                                                        */
/* ------------------------------------------------------------------ */

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getProductBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      material: products.material,
      fit: products.fit,
      careInstructions: products.careInstructions,
      sourceType: products.sourceType,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      story: products.story,
      stylingNote: products.stylingNote,
      tone: products.tone,
      seoTitle: products.seoTitle,
      seoDescription: products.seoDescription,
      chapter: {
        number: chapters.number,
        slug: chapters.slug,
        title: chapters.title,
        releaseAt: chapters.releaseAt,
        letterSignature: chapters.letterSignature,
      },
    })
    .from(products)
    .leftJoin(chapters, and(eq(chapters.id, products.chapterId), eq(chapters.status, "published")))
    .where(and(eq(products.slug, slug), eq(products.status, "active")));
  if (!product) return null;

  const [variants, images] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        priceMinor: productVariants.priceMinor,
        compareAtMinor: productVariants.compareAtMinor,
        condition: productVariants.condition,
        onHand: productVariants.onHand,
        measurements: productVariants.measurements,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true))),
    db
      .select({ url: productImages.url, alt: productImages.altText, width: productImages.width, height: productImages.height })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder)),
  ]);

  return {
    ...product,
    chapter: product.chapter?.slug ? product.chapter : null,
    variants: variants
      .sort((a, b) => compareSizes(a.size, b.size))
      .map((v) => ({ ...v, measurements: (v.measurements ?? null) as Measurements | null })),
    images,
  };
}

/** Neighbouring pieces in the house sequence, for "previous / next piece". */
export async function getAdjacentPieces(pieceNumber: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const pick = { slug: products.slug, pieceNumber: products.pieceNumber, pieceName: products.pieceName, name: products.name };
  const live = and(eq(products.status, "active"), isNotNull(products.pieceNumber));
  const [prev, next] = await Promise.all([
    db
      .select(pick)
      .from(products)
      .where(and(live, sql`${products.pieceNumber} < ${pieceNumber}`))
      .orderBy(desc(products.pieceNumber))
      .limit(1),
    db
      .select(pick)
      .from(products)
      .where(and(live, sql`${products.pieceNumber} > ${pieceNumber}`))
      .orderBy(asc(products.pieceNumber))
      .limit(1),
  ]);
  return { prev: prev[0] ?? null, next: next[0] ?? null };
}

/* ------------------------------------------------------------------ */
/* Store-facing settings                                               */
/* ------------------------------------------------------------------ */

export const SETTINGS_TAG = "settings";

/** The few settings the storefront shows. Never returns GSTIN-adjacent or internal fields beyond these. */
export async function getConcierge() {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);

  const [row] = await db
    .select({ whatsapp: storeSettings.supportWhatsapp, name: storeSettings.conciergeName, email: storeSettings.supportEmail })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));
  return row ?? { whatsapp: null, name: null, email: null };
}
