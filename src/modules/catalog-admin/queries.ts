import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, chapters, productCategories, productImages, productVariants, products } from "@/db/schema";
import { paiseToRupeesText } from "@/lib/money";
import { dateToIst, nextChapterNumber } from "./chapters";
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
  chapterNumber: number | null;
  priceMinor: number | null;
  onHand: number;
  sold: number;
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
      chapterNumber: chapters.number,
      // Correlated subqueries name the outer table explicitly (see listAdminChapters).
      priceMinor: sql<number | null>`(select min(v.price_minor) from product_variants v where v.product_id = products.id and v.is_active)::bigint`,
      onHand: sql<number>`(select coalesce(sum(v.on_hand), 0) from product_variants v where v.product_id = products.id and v.is_active)::int`,
      sold: sql<number>`(select coalesce(-sum(m.quantity_delta), 0) from inventory_movements m join product_variants v on v.id = m.variant_id where v.product_id = products.id and m.movement_type = 'sale')::int`,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(chapters, eq(chapters.id, products.chapterId))
    .orderBy(sql`${products.pieceNumber} asc nulls last`, desc(products.createdAt));
  return rows.map((r) => ({ ...r, priceMinor: r.priceMinor === null ? null : Number(r.priceMinor) }));
}

export async function getPieceForEdit(id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) return null;
  const [category] = await db
    .select({ categoryId: productCategories.categoryId })
    .from(productCategories)
    .where(eq(productCategories.productId, id))
    .limit(1);
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(desc(productVariants.isActive), asc(productVariants.createdAt));
  const photos = await db
    .select({ id: productImages.id, url: productImages.url, altText: productImages.altText })
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
  return { product, categoryId: category?.categoryId ?? null, variants, photos };
}

export type PieceForEdit = NonNullable<Awaited<ReturnType<typeof getPieceForEdit>>>;

export async function getEditorOptions() {
  const [chapterList, categoryList, suggestedNumber] = await Promise.all([
    db
      .select({ id: chapters.id, number: chapters.number, title: chapters.title })
      .from(chapters)
      .orderBy(asc(chapters.number)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    nextPieceNumber(db),
  ]);
  return { chapters: chapterList, categories: categoryList, suggestedNumber };
}

export type EditorOptions = Awaited<ReturnType<typeof getEditorOptions>>;

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** A saved piece as the editor's form values (see input.ts for the names). */
export function pieceFormValues(piece: PieceForEdit): Record<string, string> {
  const p = piece.product;
  const out: Record<string, string> = {
    pieceNumber: p.pieceNumber?.toString() ?? "",
    pieceName: p.pieceName ?? "",
    name: p.name,
    slug: p.slug,
    chapterId: p.chapterId ?? "",
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
  };
  piece.variants.forEach((v, i) => {
    const f = `v.${i}.`;
    out[`${f}size`] = v.size ?? "";
    out[`${f}priceMinor`] = paiseToRupeesText(v.priceMinor);
    out[`${f}compareAtMinor`] = v.compareAtMinor === null ? "" : paiseToRupeesText(v.compareAtMinor);
    out[`${f}condition`] = v.condition ?? "";
    out[`${f}isActive`] = v.isActive ? "on" : "off";
    out[`${f}acquisitionCostMinor`] = v.acquisitionCostMinor === null ? "" : paiseToRupeesText(v.acquisitionCostMinor);
    out[`${f}acquiredAt`] = v.acquiredAt ? IST_DATE.format(v.acquiredAt) : "";
    out[`${f}internalRef`] = v.internalRef ?? "";
    for (const [key, value] of Object.entries(v.measurements ?? {})) out[`${f}${key}`] = String(value);
  });
  return out;
}

export function getPublishProblems(productId: string) {
  return publishProblems(db, productId);
}

/* Chapters ------------------------------------------------------------ */

export async function listAdminChapters() {
  return db
    .select({
      id: chapters.id,
      number: chapters.number,
      title: chapters.title,
      status: chapters.status,
      releaseAt: chapters.releaseAt,
      // Spelled out: in a one-table query Drizzle writes ${chapters.id} as a bare "id", which the subquery would read as p.id.
      pieceCount: sql<number>`(select count(*) from products p where p.chapter_id = chapters.id and p.status = 'active')::int`,
    })
    .from(chapters)
    .orderBy(desc(chapters.number));
}

export async function getChapterForEdit(id: string) {
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, id));
  return chapter ?? null;
}

export type ChapterForEdit = NonNullable<Awaited<ReturnType<typeof getChapterForEdit>>>;

export function chapterFormValues(c: ChapterForEdit): Record<string, string> {
  return {
    number: String(c.number),
    title: c.title,
    subtitle: c.subtitle ?? "",
    slug: c.slug,
    letter: c.letter,
    letterSignature: c.letterSignature ?? "",
    tone: c.tone ?? "",
    releaseAt: c.releaseAt ? dateToIst(c.releaseAt) : "",
    coverImageAlt: c.coverImageAlt ?? "",
  };
}

export function getNextChapterNumber() {
  return nextChapterNumber(db);
}
