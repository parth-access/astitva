import { randomBytes } from "node:crypto";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/create";
import { auditLogs, productCategories, productImages, productVariants, products } from "@/db/schema";
import { InsufficientStockError } from "@/modules/inventory/errors";
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
  product_variants_attrs_uq: ["form", "Two colours or sizes ended up with the same name."],
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

const keyOf = (color: string | null, size: string | null) => `${color ?? ""}\u0000${size ?? ""}`;

/**
 * Creates a draft piece, or updates one, from the editor's colour × size grid.
 *
 * Every combination with a number becomes an active variant with that much
 * stock; the difference from today's count is recorded as an inventory
 * movement. Combinations left blank, and colours or sizes removed, are
 * switched off (never deleted: orders refer to them). Renaming a colour or
 * size renames its variants, so their stock and history carry over.
 */
export async function savePiece(db: Db, input: PieceInput, ctx: { productId?: string; actorId: string }): Promise<string> {
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

      // Renames first, so a renamed colour or size keeps its variants (and a colour its photos).
      for (const c of input.colours) {
        if (c.was !== null && c.was !== c.name) {
          await tx
            .update(productVariants)
            .set({ color: c.name })
            .where(and(eq(productVariants.productId, productId), eq(productVariants.color, c.was)));
          await tx
            .update(productImages)
            .set({ color: c.name })
            .where(and(eq(productImages.productId, productId), eq(productImages.color, c.was)));
        }
      }
      for (const s of input.sizes) {
        if (s.was !== null && s.was !== s.name) {
          await tx
            .update(productVariants)
            .set({ size: s.name })
            .where(and(eq(productVariants.productId, productId), eq(productVariants.size, s.was)));
        }
      }

      const existing = await tx.select().from(productVariants).where(eq(productVariants.productId, productId)).for("update");
      const byKey = new Map(existing.map((v) => [keyOf(v.color, v.size), v]));
      const wanted = new Set<string>();
      const shared = {
        priceMinor: input.priceMinor,
        compareAtMinor: input.compareAtMinor,
        condition: input.condition,
        acquisitionCostMinor: input.acquisitionCostMinor,
        acquiredAt: input.acquiredAt ? new Date(`${input.acquiredAt}T00:00:00+05:30`) : null,
        internalRef: input.internalRef,
      };

      for (const [i, colour] of input.colours.entries()) {
        for (const [j, size] of input.sizes.entries()) {
          const target = input.stock[i]?.[j] ?? null;
          if (target === null) continue;
          const key = keyOf(colour.name, size.name);
          wanted.add(key);
          const values = { ...shared, color: colour.name, colorHex: colour.hex, size: size.name, measurements: size.measurements, isActive: true };
          let variant = byKey.get(key);
          if (variant) {
            await tx.update(productVariants).set(values).where(eq(productVariants.id, variant.id));
          } else {
            [variant] = await tx.insert(productVariants).values({ ...values, productId, sku: newSku() }).returning();
          }
          // Only the change typed: what the editor showed when it opened, to what was entered. A
          // sale while the editor was open has already lowered the count, and must not be undone.
          const seen = byKey.has(key) ? (input.seen[i]?.[j] ?? null) : null;
          const delta = target - (seen ?? variant!.onHand);
          if (delta !== 0) {
            if (variant!.onHand + delta < 0) {
              throw new PieceRuleError({ [`stock.${i}.${j}`]: `Only ${variant!.onHand} left now: some sold while you were editing. Reload and set the count again.` });
            }
            try {
              await adjustStock(tx, {
                variantId: variant!.id,
                delta,
                type: delta > 0 && variant!.onHand === 0 && !byKey.has(key) ? "receipt" : "adjustment",
                reason: "Count set in the piece editor",
                actorId: ctx.actorId,
              });
            } catch (err) {
              if (err instanceof InsufficientStockError) {
                throw new PieceRuleError({ [`stock.${i}.${j}`]: "Some are in customers' bags right now. Try again shortly." });
              }
              throw err;
            }
          }
        }
      }

      const retired = existing.filter((v) => v.isActive && !wanted.has(keyOf(v.color, v.size)));
      if (retired.length) {
        await tx
          .update(productVariants)
          .set({ isActive: false })
          .where(inArray(productVariants.id, retired.map((v) => v.id)));
      }

      await tx.insert(auditLogs).values({
        actorId: ctx.actorId,
        action: ctx.productId ? "piece.updated" : "piece.created",
        resourceType: "product",
        resourceId: productId,
        metadata: { pieceNumber: input.pieceNumber, slug: input.slug, variants: wanted.size },
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
  if (!live) problems.push("Enter stock for at least one colour and size.");
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
