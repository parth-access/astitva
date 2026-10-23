/**
 * Saved pieces ("hearts"): styles a customer wants to come back to. By
 * style, not colour or size. Only signed-in customers can save; a heart
 * tapped while signed out asks them to sign in first.
 *
 * Framework-free (the database is passed in) so tests can call it.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/create";
import { products, savedPieces, users } from "@/db/schema";

/** Plenty for a wish list, and a bound on what one account can store. */
export const MAX_SAVED = 100;

export type SaveOutcome = "saved" | "unavailable" | "full";

/** The styles the customer has saved, newest first. */
export async function listSavedIds(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: savedPieces.productId })
    .from(savedPieces)
    .where(eq(savedPieces.userId, userId))
    .orderBy(desc(savedPieces.createdAt))
    .limit(MAX_SAVED);
  return rows.map((r) => r.productId);
}

/** Saves a published style. Saving one already saved is fine. */
export async function savePiece(db: Db, userId: string, productId: string): Promise<SaveOutcome> {
  return db.transaction(async (tx) => {
    // One customer's saves run one at a time, so the count stays right.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [product] = await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.status, "active")));
    if (!product) return "unavailable";
    const [already] = await tx
      .select({ productId: savedPieces.productId })
      .from(savedPieces)
      .where(and(eq(savedPieces.userId, userId), eq(savedPieces.productId, productId)));
    if (already) return "saved";
    if ((await listSavedIds(tx, userId)).length >= MAX_SAVED) return "full";
    await tx.insert(savedPieces).values({ userId, productId }).onConflictDoNothing();
    return "saved";
  });
}

export async function unsavePiece(db: DbOrTx, userId: string, productId: string): Promise<void> {
  await db.delete(savedPieces).where(and(eq(savedPieces.userId, userId), eq(savedPieces.productId, productId)));
}
