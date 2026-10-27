import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, productCategories, productImages, productVariants, products } from "@/db/schema";
import { paiseToRupeesText } from "@/lib/money";
import { compareSizes } from "@/lib/sizes";
import { nextPieceNumber, publishProblems } from "./service";

/**
 * Admin reads. Unlike src/modules/catalog these are never cached and do
 * include private fields (cost, internal ref), so never import them into
 * storefront code.
 */

export type AdminPieceRow = {
  id: string;
  pieceNumber: number | null;
  pieceName: string | null;
  name: string;
  status: "draft" | "active" | "archived";
  priceMinor: number | null;
  onHand: number;
  colours: { name: string | null; hex: string | null }[];
  sizes: number;
  /** Colours × sizes at or under their low-stock mark. */
  low: number;
  /** The first photo's address, for the thumbnail. */
  cover: string | null;
  tone: string | null;
  updatedAt: Date;
};

export async function listAdminPieces(): Promise<AdminPieceRow[]> {
  const rows = await db
    .select({
      id: products.id,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      name: products.name,
      status: products.status,
      // Correlated subqueries name the outer table explicitly: in a one-table
      // query Drizzle would write ${products.id} as a bare "id".
      priceMinor: sql<number | null>`(select min(v.price_minor) from product_variants v where v.product_id = products.id and v.is_active)::bigint`,
      onHand: sql<number>`(select coalesce(sum(v.on_hand), 0) from product_variants v where v.product_id = products.id and v.is_active)::int`,
      colours: sql<{ name: string | null; hex: string | null }[]>`(
        select coalesce(json_agg(json_build_object('name', c.color, 'hex', c.hex) order by c.first), '[]'::json)
        from (select v.color, max(v.color_hex) as hex, min(v.created_at) as first
              from product_variants v where v.product_id = products.id and v.is_active group by v.color) c)`,
      sizes: sql<number>`(select count(distinct coalesce(v.size, '')) from product_variants v where v.product_id = products.id and v.is_active)::int`,
      // Variants at or under their low-stock mark (sold out included).
      low: sql<number>`(select count(*) from product_variants v where v.product_id = products.id and v.is_active and v.on_hand <= v.low_stock_threshold)::int`,
      cover: sql<string | null>`(select i.url from product_images i where i.product_id = products.id order by i.sort_order, i.created_at limit 1)`,
      tone: products.tone,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .orderBy(sql`${products.pieceNumber} asc nulls last`, desc(products.createdAt));
  return rows.map((r) => ({ ...r, priceMinor: r.priceMinor === null ? null : Number(r.priceMinor) }));
}

/** Colours and sizes running low (at or under their mark, sold out included) on pieces that aren't hidden. */
export async function listLowStock(limit = 8) {
  return db
    .select({
      productId: products.id,
      pieceName: products.pieceName,
      name: products.name,
      color: productVariants.color,
      size: productVariants.size,
      onHand: productVariants.onHand,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(sql`${productVariants.isActive} and ${products.status} <> 'archived' and ${productVariants.onHand} <= ${productVariants.lowStockThreshold}`)
    .orderBy(asc(productVariants.onHand), asc(products.pieceNumber))
    .limit(limit);
}

export async function getPieceForEdit(id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) return null;
  const [[category], variants, photos] = await Promise.all([
    db
      .select({ categoryId: productCategories.categoryId })
      .from(productCategories)
      .where(eq(productCategories.productId, id))
      .limit(1),
    db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.createdAt)),
    db
      .select({ id: productImages.id, url: productImages.url, originalUrl: productImages.originalUrl, edit: productImages.edit, altText: productImages.altText, color: productImages.color })
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
  ]);
  return { product, categoryId: category?.categoryId ?? null, variants, photos };
}

export type PieceForEdit = NonNullable<Awaited<ReturnType<typeof getPieceForEdit>>>;

export async function getEditorOptions() {
  const [categoryList, suggestedNumber] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    nextPieceNumber(db),
  ]);
  return { categories: categoryList, suggestedNumber };
}

export type EditorOptions = Awaited<ReturnType<typeof getEditorOptions>>;

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** The colours and sizes on offer (active variants), in the editor's order. */
export function pieceGrid(piece: PieceForEdit) {
  const active = piece.variants.filter((v) => v.isActive);
  const colours: { name: string | null; hex: string | null }[] = [];
  for (const v of active) {
    const c = colours.find((x) => x.name === v.color);
    if (!c) colours.push({ name: v.color, hex: v.colorHex });
    else c.hex ??= v.colorHex;
  }
  const sizes = [...new Set(active.map((v) => v.size))].sort(compareSizes);
  return { active, colours, sizes };
}

/** A saved piece as the editor's form values (see input.ts for the names). */
export function pieceFormValues(piece: PieceForEdit): Record<string, string> {
  const p = piece.product;
  const { active, colours, sizes } = pieceGrid(piece);
  const first = active[0];
  const out: Record<string, string> = {
    pieceNumber: p.pieceNumber?.toString() ?? "",
    pieceName: p.pieceName ?? "",
    name: p.name,
    slug: p.slug,
    categoryId: piece.categoryId ?? "",
    tone: p.tone ?? "",
    story: p.story ?? "",
    stylingNote: p.stylingNote ?? "",
    description: p.description,
    material: p.material ?? "",
    fit: p.fit ?? "",
    careInstructions: p.careInstructions ?? "",
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    priceMinor: first ? paiseToRupeesText(first.priceMinor) : "",
    compareAtMinor: first?.compareAtMinor ? paiseToRupeesText(first.compareAtMinor) : "",
    condition: first?.condition ?? "",
    acquisitionCostMinor: first?.acquisitionCostMinor != null ? paiseToRupeesText(first.acquisitionCostMinor) : "",
    acquiredAt: first?.acquiredAt ? IST_DATE.format(first.acquiredAt) : "",
    internalRef: first?.internalRef ?? "",
  };
  colours.forEach((c, i) => {
    out[`c.${i}.name`] = c.name ?? "";
    out[`c.${i}.was`] = c.name ?? "";
    out[`c.${i}.hex`] = c.hex ?? "";
  });
  sizes.forEach((size, j) => {
    out[`s.${j}.name`] = size ?? "";
    out[`s.${j}.was`] = size ?? "";
    const withMeasures = active.find((v) => v.size === size && v.measurements);
    for (const [key, value] of Object.entries(withMeasures?.measurements ?? {})) out[`s.${j}.${key}`] = String(value);
  });
  colours.forEach((c, i) =>
    sizes.forEach((size, j) => {
      const v = active.find((x) => x.color === c.name && x.size === size);
      out[`stock.${i}.${j}`] = v ? String(v.onHand) : "";
      // The count as the editor opened, so a save applies only the change typed (see savePiece).
      if (v) out[`seen.${i}.${j}`] = String(v.onHand);
    }),
  );
  return out;
}

export function getPublishProblems(productId: string) {
  return publishProblems(db, productId);
}
