import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { auditLogs, productImages, products, users } from "../../src/db/schema";
import { addPhoto, movePhoto, removePhoto, setPhotoAlt } from "../../src/modules/catalog-admin/photos";
import { PieceRuleError } from "../../src/modules/catalog-admin/service";
import { hasDb, makeDb, resetData } from "./helpers";

const photo = (n: number, tone: string | null = null) => ({
  publicId: `astitva/pieces/p${n}`,
  url: `https://res.cloudinary.com/demo/image/upload/v1/astitva/pieces/p${n}.jpg`,
  width: 1600,
  height: 2000,
  tone,
});

describe.skipIf(!hasDb)("piece photos", () => {
  const db = makeDb(4);
  let actorId: string;
  let productId: string;

  const order = async () =>
    (
      await db
        .select({ url: productImages.url, sortOrder: productImages.sortOrder })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(asc(productImages.sortOrder))
    ).map((r) => `${r.sortOrder}:${r.url.match(/p\d+/)![0]}`);

  beforeEach(async () => {
    await resetData(db);
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    actorId = u!.id;
    const [p] = await db.insert(products).values({ name: "Test dress", slug: "test-dress" }).returning();
    productId = p!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("adds photos in order and takes the tone from the first only if the piece has none", async () => {
    await addPhoto(db, productId, photo(1, "#6b6b46"), actorId);
    await addPhoto(db, productId, photo(2, "#ffffff"), actorId);
    expect(await order()).toEqual(["0:p1", "1:p2"]);
    const [p] = await db.select({ tone: products.tone }).from(products).where(eq(products.id, productId));
    expect(p!.tone).toBe("#6b6b46");
    const audit = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.resourceId, productId));
    expect(audit.map((a) => a.action)).toEqual(["piece.photo_added", "piece.photo_added"]);
  });

  it("reorders without gaps, makes a cover, and ignores moves past the ends", async () => {
    const [a, b, c] = [await addPhoto(db, productId, photo(1), actorId), await addPhoto(db, productId, photo(2), actorId), await addPhoto(db, productId, photo(3), actorId)];
    await movePhoto(db, productId, c.id, "first");
    expect(await order()).toEqual(["0:p3", "1:p1", "2:p2"]);
    await movePhoto(db, productId, a.id, "later");
    expect(await order()).toEqual(["0:p3", "1:p2", "2:p1"]);
    await movePhoto(db, productId, c.id, "earlier");
    await movePhoto(db, productId, a.id, "later");
    expect(await order()).toEqual(["0:p3", "1:p2", "2:p1"]);
    expect(b.id).toBeTruthy();
  });

  it("describes and removes a photo, but only on its own piece", async () => {
    const a = await addPhoto(db, productId, photo(1), actorId);
    await setPhotoAlt(db, productId, a.id, "  Worn with a belt  ");
    const [row] = await db.select().from(productImages).where(eq(productImages.id, a.id));
    expect(row!.altText).toBe("Worn with a belt");

    const [other] = await db.insert(products).values({ name: "Other", slug: "other" }).returning();
    await expect(setPhotoAlt(db, other!.id, a.id, "x")).rejects.toBeInstanceOf(PieceRuleError);
    await expect(removePhoto(db, other!.id, a.id, actorId)).rejects.toBeInstanceOf(PieceRuleError);

    expect(await removePhoto(db, productId, a.id, actorId)).toBe(photo(1).url);
    expect(await order()).toEqual([]);
  });
});
