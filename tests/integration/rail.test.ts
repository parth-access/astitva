import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, productVariants, products, railPhotos, users } from "../../src/db/schema";
import { finishRailPhoto, listRailPhotos, removeRailPhoto, setRailPhoto } from "../../src/modules/catalog-admin/rail";
import { PieceRuleError } from "../../src/modules/catalog-admin/service";
import { hasDb, makeDb, resetData } from "./helpers";

const shot = (n: number) => `https://res.cloudinary.com/demo/image/upload/v1/astitva/rail/h${n}.jpg`;
const cut = (n: number) => ({ url: `https://res.cloudinary.com/demo/image/upload/v2/astitva/rail/c${n}.png`, width: 900, height: 1200 });

describe.skipIf(!hasDb)("hanger shots for the clothing rail", () => {
  const db = makeDb(2);
  let actorId: string;
  let productId: string;

  beforeEach(async () => {
    await resetData(db);
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    actorId = u!.id;
    const [p] = await db.insert(products).values({ name: "Crochet sweater", slug: "crochet-sweater" }).returning();
    productId = p!.id;
    await db.insert(productVariants).values([
      { productId, sku: "AST-T1", color: "Cream", priceMinor: 160000 },
      { productId, sku: "AST-T2", color: "Black", priceMinor: 160000 },
    ]);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("records an upload without a cut-out, then fills it in once", async () => {
    const { id, replaced } = await setRailPhoto(db, productId, { colour: "Cream", side: "front", sourceUrl: shot(1) }, actorId);
    expect(replaced).toEqual([]);
    expect((await listRailPhotos(db, productId))[0]).toMatchObject({ id, color: "Cream", side: "front", url: null });
    expect(await finishRailPhoto(db, productId, id, cut(1))).toBe(true);
    // A second, slower check mustn't overwrite it.
    expect(await finishRailPhoto(db, productId, id, cut(2))).toBe(false);
    expect((await listRailPhotos(db, productId))[0]!.url).toBe(cut(1).url);
  });

  it("replaces a colour's front, handing back both old files to delete, and keeps the back", async () => {
    const first = await setRailPhoto(db, productId, { colour: "Cream", side: "front", sourceUrl: shot(1) }, actorId);
    await finishRailPhoto(db, productId, first.id, cut(1));
    await setRailPhoto(db, productId, { colour: "Cream", side: "back", sourceUrl: shot(2) }, actorId);
    const again = await setRailPhoto(db, productId, { colour: "Cream", side: "front", sourceUrl: shot(3) }, actorId);
    expect(again.replaced.sort()).toEqual([cut(1).url, shot(1)].sort());
    expect((await listRailPhotos(db, productId)).map((p) => [p.side, p.sourceUrl]).sort()).toEqual([["back", shot(2)], ["front", shot(3)]]);
    // The first upload's cut-out arriving late belongs to nothing.
    expect(await finishRailPhoto(db, productId, first.id, cut(9))).toBe(false);
  });

  it("refuses a colour the piece doesn't come in, and a piece that's gone", async () => {
    await expect(setRailPhoto(db, productId, { colour: "Rust", side: "front", sourceUrl: shot(1) }, actorId)).rejects.toBeInstanceOf(PieceRuleError);
    await expect(setRailPhoto(db, "00000000-0000-4000-8000-000000000000", { colour: "Cream", side: "front", sourceUrl: shot(1) }, actorId)).rejects.toBeInstanceOf(PieceRuleError);
  });

  it("removes a shot, handing back its files, and logs both changes", async () => {
    const { id } = await setRailPhoto(db, productId, { colour: "Black", side: "front", sourceUrl: shot(1) }, actorId);
    await finishRailPhoto(db, productId, id, cut(1));
    expect((await removeRailPhoto(db, productId, id, actorId)).sort()).toEqual([cut(1).url, shot(1)].sort());
    expect(await db.select().from(railPhotos)).toEqual([]);
    await expect(removeRailPhoto(db, productId, id, actorId)).rejects.toBeInstanceOf(PieceRuleError);
    const audit = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.resourceId, productId));
    expect(audit.map((a) => a.action).sort()).toEqual(["piece.rail_added", "piece.rail_removed"]);
  });
});
