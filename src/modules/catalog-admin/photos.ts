import { and, asc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "@/db/create";
import { auditLogs, productImages, products } from "@/db/schema";
import { editedPhotoUrl, type PhotoEdit } from "@/lib/photo-edit";
import type { VerifiedPhoto } from "@/modules/media/cloudinary";
import { PieceRuleError } from "./service";

/**
 * A piece's photographs. The first (lowest sort order) is the cover shown in
 * its arch. Files live on Cloudinary; these rows hold their addresses.
 */

export const ALT_MAX = 240;

async function ownPhoto(db: Db, productId: string, photoId: string) {
  const [row] = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, photoId), eq(productImages.productId, productId)));
  if (!row) throw new PieceRuleError({ form: "That photo isn't on this piece any more." });
  return row;
}

/**
 * Records a verified upload at the end of the list, as a photo of one colour
 * or of every colour (null). Gives the piece its tone from the photo if it has none.
 */
export async function addPhoto(db: Db, productId: string, photo: VerifiedPhoto, actorId: string, colour: string | null = null) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for("update");
    if (!p) throw new PieceRuleError({ form: "This piece no longer exists." });
    const [{ last } = { last: null }] = await tx
      .select({ last: max(productImages.sortOrder) })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    const [row] = await tx
      .insert(productImages)
      .values({ productId, url: photo.url, color: colour?.trim() || null, width: photo.width, height: photo.height, sortOrder: (last ?? -1) + 1 })
      .returning();
    if (photo.tone) {
      await tx.update(products).set({ tone: photo.tone }).where(and(eq(products.id, productId), isNull(products.tone)));
    }
    await tx.insert(auditLogs).values({
      actorId,
      action: "piece.photo_added",
      resourceType: "product",
      resourceId: productId,
      metadata: { photoId: row!.id, url: photo.url },
    });
    return row!;
  });
}

export async function setPhotoAlt(db: Db, productId: string, photoId: string, altText: string) {
  await ownPhoto(db, productId, photoId);
  const alt = altText.trim();
  if (alt.length > ALT_MAX) throw new PieceRuleError({ form: `Keep the description under ${ALT_MAX} characters.` });
  await db.update(productImages).set({ altText: alt }).where(eq(productImages.id, photoId));
}

/** Ties a photo to one colour (shown when that colour is chosen), or to every colour (null). */
export async function setPhotoColour(db: Db, productId: string, photoId: string, colour: string | null) {
  await ownPhoto(db, productId, photoId);
  await db.update(productImages).set({ color: colour?.trim() || null }).where(eq(productImages.id, photoId));
}

/**
 * Saves a photo's flip, turn and crop, or undoes them (null). Always worked
 * out from the untouched original, so editing again never stacks edits.
 */
export async function setPhotoEdit(db: Db, productId: string, photoId: string, edit: PhotoEdit | null, actorId: string) {
  const row = await ownPhoto(db, productId, photoId);
  const original = row.originalUrl ?? row.url;
  await db.transaction(async (tx) => {
    await tx
      .update(productImages)
      .set({ url: editedPhotoUrl(original, edit), originalUrl: edit ? original : null, edit })
      .where(eq(productImages.id, photoId));
    await tx.insert(auditLogs).values({
      actorId,
      action: edit ? "piece.photo_edited" : "piece.photo_edit_undone",
      resourceType: "product",
      resourceId: productId,
      metadata: { photoId, edit },
    });
  });
}

/**
 * Moves a photo one place earlier or later among the photos of its own colour
 * (or of every colour), or to the front of them: the first of a colour is
 * the one shown when that colour is chosen. The very first photo overall is
 * the piece's cover.
 */
export async function movePhoto(db: Db, productId: string, photoId: string, direction: "earlier" | "later" | "first") {
  await db.transaction(async (tx) => {
    const photos = await tx
      .select({ id: productImages.id, color: productImages.color })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt))
      .for("update");
    const from = photos.findIndex((p) => p.id === photoId);
    if (from === -1) throw new PieceRuleError({ form: "That photo isn't on this piece any more." });
    // The places the photos of this colour hold. They reorder among those places; every other photo stays put.
    const places = photos.flatMap((p, i) => (p.color === photos[from]!.color ? [i] : []));
    const at = places.indexOf(from);
    const to = direction === "first" ? 0 : direction === "earlier" ? at - 1 : at + 1;
    if (to < 0 || to >= places.length || to === at) return;
    const members = places.map((i) => photos[i]!);
    const [moved] = members.splice(at, 1);
    members.splice(to, 0, moved!);
    places.forEach((place, i) => (photos[place] = members[i]!));
    // Rewrite every position, so the order is always 0, 1, 2… without gaps or ties.
    for (const [i, p] of photos.entries()) {
      await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, p.id));
    }
  });
}

/** Removes the photo's row and returns its original address, so the caller can delete the file. */
export async function removePhoto(db: Db, productId: string, photoId: string, actorId: string): Promise<string> {
  const row = await ownPhoto(db, productId, photoId);
  await db.transaction(async (tx) => {
    await tx.delete(productImages).where(eq(productImages.id, photoId));
    await tx.insert(auditLogs).values({
      actorId,
      action: "piece.photo_removed",
      resourceType: "product",
      resourceId: productId,
      metadata: { photoId, url: row.url },
    });
  });
  return row.originalUrl ?? row.url;
}
