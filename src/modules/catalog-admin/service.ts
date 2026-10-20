import { randomBytes } from "node:crypto";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/create";
import { auditLogs, productCategories, productVariants, products } from "@/db/schema";
import { adjustStock } from "@/modules/inventory/service";
import { productMachine, type ProductStatus } from "@/modules/orders/machines";
import type { FieldErrors, PieceInput } from "./input";

/**
 * Admin writes to the catalogue. Framework-free: server actions call these
 * and then refresh the storefront cache. Stock moves only through the
 * inventory service; status only through productMachine.
 */

/** A save the editor should show next to its fields rather than as a crash. */
export class PieceRuleError extends Error {
  constructor(readonly errors: FieldErrors) {
    super(Object.values(errors).join(" "));
    this.name = "PieceRuleError";
  }
}

const UNIQUE_FIELDS: Record<string, [string, string]> = {
  products_slug_unique: ["slug", "Another piece already uses this web address."],
  products_piece_number_unique: ["pieceNumber", "Another piece already has this number. Numbers are never reused."],
  product_variants_attrs_uq: ["form", "Two sizes have the same name."],
};

/** Turns a unique-constraint clash into a field error. */
function asRuleError(err: unknown): never {
  const pg = (err as { cause?: { code?: string; constraint?: string } }).cause ?? (err as { code?: string; constraint?: string });
  const hit = pg?.code === "23505" && pg.constraint ? UNIQUE_FIELDS[pg.constraint] : undefined;
  if (hit) throw new PieceRuleError({ [hit[0]]: hit[1] });
  throw err;
}

export async function nextPieceNumber(db: Db | Tx): Promise<number> {
  const [row] = await db.select({ n: max(products.pieceNumber) }).from(products);
  return (row?.n ?? 0) + 1;
}

function newSku() {
  return `AST-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function productValues(input: PieceInput) {
  return {
    pieceNumber: input.pieceNumber,
    pieceName: input.pieceName,
    name: input.name,
    slug: input.slug,
    chapterId: input.chapterId,
    tone: input.tone,
    story: input.story,
    stylingNote: input.stylingNote,
    description: input.description ?? "",
    material: input.material,
    fit: input.fit,
    careInstructions: input.careInstructions,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };
}

/** Creates a draft piece, or updates one. Returns the product id. */
export async function savePiece(
  db: Db,
  input: PieceInput,
  ctx: { productId?: string; actorId: string },
): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      let productId = ctx.productId;

      if (productId) {
        const [current] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
        if (!current) throw new PieceRuleError({ form: "This piece no longer exists." });
        // Once public, a piece's number and address are printed, shared and linked.
        if (current.publishedAt) {
          const locked: FieldErrors = {};
          if (current.pieceNumber !== input.pieceNumber) locked.pieceNumber = "The number can't change after the piece is published.";
          if (current.slug !== input.slug) locked.slug = "The web address can't change after the piece is published.";
          if (Object.keys(locked).length) throw new PieceRuleError(locked);
        }
        await tx.update(products).set(productValues(input)).where(eq(products.id, productId));
      } else {
        const [created] = await tx.insert(products).values(productValues(input)).returning({ id: products.id });
        productId = created!.id;
      }

      await tx.delete(productCategories).where(eq(productCategories.productId, productId));
      if (input.categoryId) await tx.insert(productCategories).values({ productId, categoryId: input.categoryId });

      const existingIds = input.variants.flatMap((v) => (v.id ? [v.id] : []));
      if (existingIds.length) {
        const owned = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(and(eq(productVariants.productId, productId), inArray(productVariants.id, existingIds)));
        if (owned.length !== new Set(existingIds).size) throw new PieceRuleError({ form: "A size doesn't belong to this piece." });
      }

      for (const v of input.variants) {
        const values = {
          size: v.size,
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor,
          condition: v.condition,
          isActive: v.isActive,
          measurements: v.measurements,
          acquisitionCostMinor: v.acquisitionCostMinor,
          acquiredAt: v.acquiredAt ? new Date(`${v.acquiredAt}T00:00:00+05:30`) : null,
          internalRef: v.internalRef,
        };
        if (v.id) {
          await tx.update(productVariants).set(values).where(eq(productVariants.id, v.id));
        } else {
          const [variant] = await tx
            .insert(productVariants)
            .values({ ...values, productId, sku: newSku() })
            .returning({ id: productVariants.id });
          if (v.initialStock) {
            await adjustStock(tx, {
              variantId: variant!.id,
              delta: v.initialStock,
              type: "receipt",
              reason: "Added in the piece editor",
              actorId: ctx.actorId,
            });
          }
        }
      }

      await tx.insert(auditLogs).values({
        actorId: ctx.actorId,
        action: ctx.productId ? "piece.updated" : "piece.created",
        resourceType: "product",
        resourceId: productId,
        metadata: { pieceNumber: input.pieceNumber, slug: input.slug },
      });
      return productId;
    });
  } catch (err) {
    if (err instanceof PieceRuleError) throw err;
    asRuleError(err);
  }
}

/** What a piece needs before it can go on the site. */
export async function publishProblems(tx: Db | Tx, productId: string): Promise<string[]> {
  const [p] = await tx.select().from(products).where(eq(products.id, productId));
  if (!p) return ["This piece no longer exists."];
  const problems: string[] = [];
  if (!p.pieceNumber) problems.push("Give it a number.");
  if (!p.pieceName) problems.push("Give it a name.");
  const [{ live } = { live: 0 }] = await tx
    .select({ live: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)));
  if (!live) problems.push("Add at least one size that's on sale.");
  return problems;
}

/** Publish, hide or restore a piece. */
export async function setPieceStatus(db: Db, productId: string, to: ProductStatus, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
    if (!p) throw new PieceRuleError({ form: "This piece no longer exists." });
    productMachine.assertTransition(p.status, to);
    if (to === "active") {
      const problems = await publishProblems(tx, productId);
      if (problems.length) throw new PieceRuleError({ form: `Before publishing: ${problems.join(" ")}` });
    }
    await tx
      .update(products)
      .set({ status: to, publishedAt: to === "active" ? (p.publishedAt ?? new Date()) : p.publishedAt })
      .where(eq(products.id, productId));
    await tx.insert(auditLogs).values({
      actorId,
      action: `piece.status.${to}`,
      resourceType: "product",
      resourceId: productId,
      metadata: { from: p.status, to },
    });
  });
}

export type StockChange = { variantId: string; delta: number; type: "receipt" | "adjustment" | "damage"; reason: string };

/** Changes stock for one size through the inventory service, which records the movement. */
export async function changePieceStock(db: Db, productId: string, change: StockChange, actorId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.id, change.variantId), eq(productVariants.productId, productId)));
    if (!v) throw new PieceRuleError({ form: "That size doesn't belong to this piece." });
    return adjustStock(tx, { ...change, actorId });
  });
}
