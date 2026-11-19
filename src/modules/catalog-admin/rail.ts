import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/create";
import { auditLogs, productVariants, products, railPhotos } from "@/db/schema";
import type { RailSide } from "@/lib/rail";
import { PieceRuleError } from "./service";

/**
 * Hanger shots for the clothing rail: per colour, a front and optionally a
 * back. An upload is recorded straight away with no cut-out (url null);
 * finishRailPhoto fills it in once Cloudinary has removed the background.
 * Until then the piece page doesn't count that colour as hung.
 */

export type AdminRailPhoto = { id: string; color: string | null; side: RailSide; sourceUrl: string; url: string | null };

export async function listRailPhotos(db: Db, productId: string): Promise<AdminRailPhoto[]> {
  return db
    .select({ id: railPhotos.id, color: railPhotos.color, side: railPhotos.side, sourceUrl: railPhotos.sourceUrl, url: railPhotos.url })
    .from(railPhotos)
    .where(eq(railPhotos.productId, productId))
    .orderBy(asc(railPhotos.createdAt));
}

/** Same colour, null-safe (a piece in one unnamed colour has null). */
const sameColour = (colour: string | null) => (colour === null ? isNull(railPhotos.color) : eq(railPhotos.color, colour));

/**
 * Records an upload as the colour's front or back, replacing the one before.
 * Returns the new row's id and the files it replaced, for the caller to delete.
 */
export async function setRailPhoto(
  db: Db,
  productId: string,
  input: { colour: string | null; side: RailSide; sourceUrl: string },
  actorId: string,
): Promise<{ id: string; replaced: string[] }> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for("update");
    if (!p) throw new PieceRuleError({ form: "This piece no longer exists." });
    const colour = input.colour?.trim() || null;
    const [known] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), colour === null ? isNull(productVariants.color) : eq(productVariants.color, colour)))
      .limit(1);
    if (!known) throw new PieceRuleError({ form: `This piece doesn't come in ${colour ?? "that colour"}.` });

    const old = await tx
      .delete(railPhotos)
      .where(and(eq(railPhotos.productId, productId), sameColour(colour), eq(railPhotos.side, input.side)))
      .returning({ sourceUrl: railPhotos.sourceUrl, url: railPhotos.url });
    const [row] = await tx.insert(railPhotos).values({ productId, color: colour, side: input.side, sourceUrl: input.sourceUrl }).returning({ id: railPhotos.id });
    await tx.insert(auditLogs).values({
      actorId,
      action: "piece.rail_added",
      resourceType: "product",
      resourceId: productId,
      metadata: { colour, side: input.side, url: input.sourceUrl },
    });
    return { id: row!.id, replaced: old.flatMap((o) => [o.sourceUrl, ...(o.url ? [o.url] : [])]) };
  });
}

/** Stores the finished cut-out. False if the row has gone (replaced or removed meanwhile) or already has one. */
export async function finishRailPhoto(db: Db, productId: string, photoId: string, cut: { url: string; width: number | null; height: number | null }): Promise<boolean> {
  const done = await db
    .update(railPhotos)
    .set({ url: cut.url, width: cut.width, height: cut.height })
    .where(and(eq(railPhotos.id, photoId), eq(railPhotos.productId, productId), isNull(railPhotos.url)))
    .returning({ id: railPhotos.id });
  return done.length > 0;
}

export async function getRailPhoto(db: Db, productId: string, photoId: string) {
  const [row] = await db
    .select()
    .from(railPhotos)
    .where(and(eq(railPhotos.id, photoId), eq(railPhotos.productId, productId)));
  return row ?? null;
}

/** Removes a hanger shot. Returns its files, for the caller to delete. */
export async function removeRailPhoto(db: Db, productId: string, photoId: string, actorId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(railPhotos)
      .where(and(eq(railPhotos.id, photoId), eq(railPhotos.productId, productId)))
      .returning();
    if (!row) throw new PieceRuleError({ form: "That hanger shot isn't on this piece any more." });
    await tx.insert(auditLogs).values({
      actorId,
      action: "piece.rail_removed",
      resourceType: "product",
      resourceId: productId,
      metadata: { colour: row.color, side: row.side },
    });
    return [row.sourceUrl, ...(row.url ? [row.url] : [])];
  });
}
