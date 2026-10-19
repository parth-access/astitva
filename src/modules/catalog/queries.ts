import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, productCategories, productImages, productVariants, products } from "@/db/schema";
import type { Measurements } from "@/db/schema";
import { compareSizes } from "@/lib/sizes";

/**
 * Storefront reads. Product content is cached and tagged "catalog"; admin
 * edits and committed sales call revalidateTag("catalog"). Live stock for the
 * buy button is read separately (uncached) on the product page.
 *
 * Internal fields (supplier, acquisition cost, internal ref) are never selected here.
 */

export const CATALOG_TAG = "catalog";

export type ProductSort = "newest" | "price_asc" | "price_desc";
export const PRODUCT_SORTS: Record<ProductSort, string> = {
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
};

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  priceMinor: number;
  compareAtMinor: number | null;
  imageUrl: string | null;
  imageAlt: string;
  onHand: number;
  variantCount: number;
};

const minPrice = sql<number>`min(${productVariants.priceMinor})::bigint`;

export async function listProducts(opts: { categorySlug?: string; sort?: ProductSort; featuredOnly?: boolean; limit?: number } = {}) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const sort = opts.sort ?? "newest";

  let categoryFilter;
  if (opts.categorySlug) {
    categoryFilter = inArray(
      products.id,
      db
        .select({ id: productCategories.productId })
        .from(productCategories)
        .innerJoin(categories, eq(categories.id, productCategories.categoryId))
        .where(eq(categories.slug, opts.categorySlug)),
    );
  }

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      publishedAt: products.publishedAt,
      priceMinor: minPrice,
      compareAtMinor: sql<number | null>`max(${productVariants.compareAtMinor})::bigint`,
      onHand: sql<number>`sum(${productVariants.onHand})::int`,
      variantCount: sql<number>`count(${productVariants.id})::int`,
    })
    .from(products)
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
    .where(and(eq(products.status, "active"), opts.featuredOnly ? eq(products.isFeatured, true) : undefined, categoryFilter))
    .groupBy(products.id)
    .orderBy(
      sort === "price_asc" ? asc(minPrice) : sort === "price_desc" ? desc(minPrice) : desc(products.publishedAt),
      asc(products.name),
    )
    .limit(opts.limit ?? 120);

  const images = await firstImages(rows.map((r) => r.id));

  return rows.map(
    (r): ProductCard => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
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
        priceMinor: productVariants.priceMinor,
        compareAtMinor: productVariants.compareAtMinor,
        condition: productVariants.condition,
        onHand: productVariants.onHand,
        measurements: productVariants.measurements,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.size)),
    db
      .select({ url: productImages.url, alt: productImages.altText, width: productImages.width, height: productImages.height })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder)),
  ]);

  return {
    ...product,
    variants: variants
      .sort((a, b) => compareSizes(a.size, b.size))
      .map((v) => ({ ...v, measurements: (v.measurements ?? null) as Measurements | null })),
    images,
  };
}
