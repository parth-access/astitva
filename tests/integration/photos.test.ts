import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { auditLogs, productImages, products, users } from "../../src/db/schema";
import { addPhoto, movePhoto, removePhoto, setPhotoAlt, setPhotoAngle, setPhotoColour, setPhotoEdit } from "../../src/modules/catalog-admin/photos";
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

  it("keeps each colour's photos in their own order, so a colour's first is its main photo", async () => {
    const sage1 = await addPhoto(db, productId, photo(1), actorId, "Sage");
    const every = await addPhoto(db, productId, photo(2), actorId, null);
    const ink1 = await addPhoto(db, productId, photo(3), actorId, "Ink");
    const sage2 = await addPhoto(db, productId, photo(4), actorId, " Sage ");
    expect([sage1.color, every.color, ink1.color, sage2.color]).toEqual(["Sage", null, "Ink", "Sage"]);

    // Earlier within Sage jumps over the photos of other colours in between.
    await movePhoto(db, productId, sage2.id, "earlier");
    expect(await order()).toEqual(["0:p4", "1:p2", "2:p3", "3:p1"]);
    // The first of its colour already: nothing moves.
    await movePhoto(db, productId, ink1.id, "first");
    await movePhoto(db, productId, ink1.id, "later");
    expect(await order()).toEqual(["0:p4", "1:p2", "2:p3", "3:p1"]);
    await movePhoto(db, productId, sage1.id, "first");
    expect(await order()).toEqual(["0:p1", "1:p2", "2:p3", "3:p4"]);
  });

  it("edits from the original every time, undoes, and still deletes the original file", async () => {
    const a = await addPhoto(db, productId, photo(1), actorId);
    const first = { rotate: 90 as const, flip: false, crop: { x: 0, y: 0.1, width: 1, height: 0.8 } };
    await setPhotoEdit(db, productId, a.id, first, actorId);
    let [row] = await db.select().from(productImages).where(eq(productImages.id, a.id));
    expect(row!.url).toBe("https://res.cloudinary.com/demo/image/upload/a_90/c_crop,x_0.0000,y_0.1000,w_1.0000,h_0.8000/v1/astitva/pieces/p1.jpg");
    expect(row!.originalUrl).toBe(photo(1).url);

    // A second edit replaces the first rather than stacking on it.
    await setPhotoEdit(db, productId, a.id, { rotate: 0, flip: true, crop: { x: 0.1, y: 0, width: 0.8, height: 0.8 } }, actorId);
    [row] = await db.select().from(productImages).where(eq(productImages.id, a.id));
    expect(row!.url).toBe("https://res.cloudinary.com/demo/image/upload/a_hflip/c_crop,x_0.1000,y_0.0000,w_0.8000,h_0.8000/v1/astitva/pieces/p1.jpg");
    expect(row!.edit).toMatchObject({ flip: true, rotate: 0 });

    await setPhotoEdit(db, productId, a.id, null, actorId);
    [row] = await db.select().from(productImages).where(eq(productImages.id, a.id));
    expect([row!.url, row!.originalUrl, row!.edit]).toEqual([photo(1).url, null, null]);

    await setPhotoEdit(db, productId, a.id, first, actorId);
    expect(await removePhoto(db, productId, a.id, actorId)).toBe(photo(1).url);
    const actions = (await db.select({ action: auditLogs.action }).from(auditLogs)).map((r) => r.action);
    expect(actions).toContain("piece.photo_edited");
    expect(actions).toContain("piece.photo_edit_undone");
  });

  it("marks each angle on one photo per colour, and a photo moved to another colour leaves its angle behind", async () => {
    const sage1 = await addPhoto(db, productId, photo(1), actorId, "Sage");
    const sage2 = await addPhoto(db, productId, photo(2), actorId, "Sage");
    const ink = await addPhoto(db, productId, photo(3), actorId, "Ink");
    const every = await addPhoto(db, productId, photo(4), actorId, null);
    const angles = async () =>
      Object.fromEntries(
        (await db.select({ url: productImages.url, angle: productImages.angle }).from(productImages).where(eq(productImages.productId, productId))).map((r) => [
          r.url.match(/p\d+/)![0],
          r.angle,
        ]),
      );

    await setPhotoAngle(db, productId, sage1.id, "front");
    await setPhotoAngle(db, productId, ink.id, "front");
    await setPhotoAngle(db, productId, every.id, "front");
    expect(await angles()).toEqual({ p1: "front", p2: null, p3: "front", p4: "front" });

    // A second Sage front takes it from the first; other colours keep theirs.
    await setPhotoAngle(db, productId, sage2.id, "front");
    expect(await angles()).toEqual({ p1: null, p2: "front", p3: "front", p4: "front" });

    await setPhotoAngle(db, productId, sage2.id, null);
    await setPhotoAngle(db, productId, sage1.id, "back");
    await setPhotoColour(db, productId, sage1.id, "Ink");
    expect(await angles()).toEqual({ p1: null, p2: null, p3: "front", p4: "front" });

    const other = await db.insert(products).values({ name: "Other", slug: "other" }).returning();
    await expect(setPhotoAngle(db, other[0]!.id, ink.id, "side")).rejects.toBeInstanceOf(PieceRuleError);
  });
});
