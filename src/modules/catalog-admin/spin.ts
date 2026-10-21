import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/create";
import { auditLogs, products } from "@/db/schema";
import { PieceRuleError } from "./service";

/**
 * A piece's turning video: one film of it going round once, from which the
 * piece page cuts the frames of its 360° view. One per piece; a new one
 * replaces the old.
 */

/**
 * Sets (or with null, removes) the piece's video. Returns the address it
 * replaced, so the caller can delete that file.
 */
export async function setSpinVideo(db: Db, productId: string, url: string | null, actorId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ old: products.spinVideoUrl }).from(products).where(eq(products.id, productId)).for("update");
    if (!p) throw new PieceRuleError({ form: "This piece no longer exists." });
    if (p.old === url) return null;
    // updated_at stays as it was: the edit form is keyed on it, and changing it would wipe unsaved typing.
    await tx.update(products).set({ spinVideoUrl: url, updatedAt: sql`${products.updatedAt}` }).where(eq(products.id, productId));
    await tx.insert(auditLogs).values({
      actorId,
      action: url ? "piece.spin_added" : "piece.spin_removed",
      resourceType: "product",
      resourceId: productId,
      metadata: { url, replaced: p.old },
    });
    return p.old;
  });
}
