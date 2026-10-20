import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
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
 * committed sales call updateTag("catalog") in server actions, or
 * revalidateTag("catalog", "max") elsewhere. Live stock for the buy button
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

/** One colour of a style, as the storefront offers it. */
export type PieceColour = {
  /** Null for a style that has no colour choice. */
  name: string | null;
  hex: string | null;
  /** Units in stock across this colour's sizes. */
  available: number;
  imageUrl: string | null;
  imageAlt: string | null;
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
  categorySlug: string | null;
  onHand: number;
  variantCount: number;
  /** Colours that exist for this style (active variants only), in the order they were added. */
  colours: PieceColour[];
};

const minPrice = sql<number>`min(${productVariants.priceMinor})::bigint`;
/** The piece's first category (it picks the sketch drawn until there is a photograph). Outer table written out: see listCategories. */
const firstCategorySlug = sql<string | null>`(select c.slug from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = products.id order by c.sort_order limit 1)`;

export async function listPieces(
  opts: { categorySlug?: string; sort?: ProductSort; featuredOnly?: boolean; limit?: number } = {},
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
      categorySlug: firstCategorySlug,
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

  const ids = rows.map((r) => r.id);
  const [images, colours] = await Promise.all([firstImages(ids), coloursOf(ids)]);

  return rows.map(
    (r): PieceCard => ({
      ...r,
      priceMinor: Number(r.priceMinor),
      compareAtMinor: r.compareAtMinor === null ? null : Number(r.compareAtMinor),
      imageUrl: images.get(r.id)?.url ?? null,
      imageAlt: images.get(r.id)?.alt || r.name,
      onHand: Number(r.onHand),
      variantCount: Number(r.variantCount),
      colours: colours.get(r.id) ?? [],
    }),
  );
}

/**
 * The colours each style is offered in, with stock and the first photo of
 * each colour (a photo with no colour counts for every colour).
 */
async function coloursOf(productIds: string[]): Promise<Map<string, PieceColour[]>> {
  const out = new Map<string, PieceColour[]>();
  if (productIds.length === 0) return out;
  const [variants, images] = await Promise.all([
    db
      .select({
        productId: productVariants.productId,
        color: productVariants.color,
        hex: productVariants.colorHex,
        onHand: productVariants.onHand,
      })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.createdAt)),
    db
      .select({ productId: productImages.productId, color: productImages.color, url: productImages.url, alt: productImages.altText })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder)),
  ]);
  for (const v of variants) {
    const list = out.get(v.productId) ?? [];
    let c = list.find((x) => x.name === v.color);
    if (!c) {
      const photo = images.find((i) => i.productId === v.productId && i.color === v.color) ?? images.find((i) => i.productId === v.productId && !i.color);
      c = { name: v.color, hex: v.hex, available: 0, imageUrl: photo?.url ?? null, imageAlt: photo?.alt || null };
      list.push(c);
    }
    c.available += Math.max(0, v.onHand);
    c.hex ??= v.hex;
    out.set(v.productId, list);
  }
  return out;
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
        // The outer table is spelled out: in a one-table query Drizzle writes ${categories.id}
        // as a bare "id", which inside this subquery would mean p.id.
        sql`exists (select 1 from ${productCategories} pc join ${products} p on p.id = pc.product_id
                    where pc.category_id = categories.id and p.status = 'active')`,
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
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
      categorySlug: firstCategorySlug,
      seoTitle: products.seoTitle,
      seoDescription: products.seoDescription,
    })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "active")));
  if (!product) return null;

  const [variants, images] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        colorHex: productVariants.colorHex,
        priceMinor: productVariants.priceMinor,
        compareAtMinor: productVariants.compareAtMinor,
        condition: productVariants.condition,
        onHand: productVariants.onHand,
        measurements: productVariants.measurements,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.createdAt)),
    db
      .select({
        url: productImages.url,
        alt: productImages.altText,
        color: productImages.color,
        width: productImages.width,
        height: productImages.height,
      })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder)),
  ]);

  return {
    ...product,
    // Colour order is the order they were added; sizes within a colour run small to large.
    variants: variants
      .map((v, i) => ({ v, i }))
      .sort((a, b) => colourRank(variants, a.v.color) - colourRank(variants, b.v.color) || compareSizes(a.v.size, b.v.size) || a.i - b.i)
      .map(({ v }) => v)
      .map((v) => ({ ...v, measurements: (v.measurements ?? null) as Measurements | null })),
    images,
  };
}

function colourRank(variants: { color: string | null }[], color: string | null) {
  return variants.findIndex((v) => v.color === color);
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

/** The home page lookbook's words, and whether customers can order yet. */
export async function getStorefront() {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);

  const [row] = await db
    .select({
      orderingOpen: storeSettings.orderingOpen,
      title: storeSettings.lookbookTitle,
      subtitle: storeSettings.lookbookSubtitle,
      note: storeSettings.note,
      noteSignature: storeSettings.noteSignature,
    })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));
  return row ?? { orderingOpen: false, title: null, subtitle: null, note: "", noteSignature: null };
}

export type Storefront = Awaited<ReturnType<typeof getStorefront>>;

/* Lookbook ------------------------------------------------------------ */

export type LookbookPiece = {
  id: string;
  slug: string;
  name: string;
  pieceNumber: number | null;
  pieceName: string | null;
  story: string | null;
  stylingNote: string | null;
  tone: string | null;
  categorySlug: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  onHand: number;
  variantCount: number;
  imageUrl: string | null;
  imageAlt: string;
  colours: PieceColour[];
};

/** Every published style, in house order, with what a lookbook page shows. */
export async function listLookbookPieces(): Promise<LookbookPiece[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      story: products.story,
      stylingNote: products.stylingNote,
      tone: products.tone,
      categorySlug: firstCategorySlug,
      priceMinor: minPrice,
      compareAtMinor: sql<number | null>`max(${productVariants.compareAtMinor})::bigint`,
      onHand: sql<number>`sum(${productVariants.onHand})::int`,
      variantCount: sql<number>`count(${productVariants.id})::int`,
    })
    .from(products)
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
    .where(eq(products.status, "active"))
    .groupBy(products.id)
    .orderBy(sql`${products.pieceNumber} asc nulls last`, asc(products.name));

  const ids = rows.map((r) => r.id);
  const [images, colours] = await Promise.all([firstImages(ids), coloursOf(ids)]);
  return rows.map((r) => ({
    ...r,
    priceMinor: Number(r.priceMinor),
    compareAtMinor: r.compareAtMinor === null ? null : Number(r.compareAtMinor),
    imageUrl: images.get(r.id)?.url ?? null,
    imageAlt: images.get(r.id)?.alt || r.name,
    colours: colours.get(r.id) ?? [],
  }));
}
