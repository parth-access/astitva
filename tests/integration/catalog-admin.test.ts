import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { auditLogs, inventoryMovements, productImages, productVariants, products, users } from "../../src/db/schema";
import { parsePieceForm, type PieceInput } from "../../src/modules/catalog-admin/input";
import { nextPieceNumber, PieceRuleError, savePiece, setPieceStatus } from "../../src/modules/catalog-admin/service";
import { createOrder, hasDb, makeDb, movementSum, resetData } from "./helpers";
import { reserveForOrder } from "../../src/modules/inventory/service";

function input(fields: Record<string, string>): PieceInput {
  const f = new FormData();
  const all = { name: "Linen wrap dress", pieceName: "Neem", priceMinor: "3499", ...fields };
  for (const [k, v] of Object.entries(all)) f.append(k, v);
  const r = parsePieceForm(f);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

/** Sage and Ink, in M and L. */
const grid = {
  "c.0.name": "Sage",
  "c.0.hex": "#8a8f6a",
  "c.1.name": "Ink",
  "c.1.hex": "#2c3140",
  "s.0.name": "M",
  "s.1.name": "L",
  "stock.0.0": "2",
  "stock.0.1": "1",
  "stock.1.0": "3",
  "stock.1.1": "",
};

async function expectRule(p: Promise<unknown>, field: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PieceRuleError);
  expect(Object.keys((err as PieceRuleError).errors)).toContain(field);
}

describe.skipIf(!hasDb)("piece editor writes", () => {
  const db = makeDb(4);
  let actorId: string;

  const variantsOf = (productId: string) =>
    db
      .select({ color: productVariants.color, size: productVariants.size, onHand: productVariants.onHand, isActive: productVariants.isActive, id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.createdAt));
  const active = async (productId: string) =>
    (await variantsOf(productId)).filter((v) => v.isActive).map((v) => `${v.color}/${v.size}:${v.onHand}`).sort();

  beforeEach(async () => {
    await resetData(db);
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    actorId = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("makes a variant per filled cell, with its stock recorded as receipts", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", ...grid }), { actorId });
    expect(await active(id)).toEqual(["Ink/M:3", "Sage/L:1", "Sage/M:2"]);
    for (const v of await variantsOf(id)) expect(await movementSum(db, v.id)).toBe(v.onHand);
    const [m] = await db.select().from(inventoryMovements).limit(1);
    expect(m).toMatchObject({ movementType: "receipt", actorId });
    const [ink] = (await variantsOf(id)).filter((v) => v.color === "Ink");
    const [row] = await db.select({ hex: productVariants.colorHex }).from(productVariants).where(eq(productVariants.id, ink!.id));
    expect(row!.hex).toBe("#2c3140");
    expect((await db.select().from(auditLogs).where(eq(auditLogs.resourceId, id))).map((a) => a.action)).toEqual(["piece.created"]);
    expect(await nextPieceNumber(db)).toBe(2);
  });

  it("sets new counts as adjustments, retires blanks, and keeps stock through a rename", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", ...grid }), { actorId });
    const sageM = (await variantsOf(id)).find((v) => v.color === "Sage" && v.size === "M")!;

    // Sage renamed Moss; Sage/M down to 1; Sage/L no longer made; Ink/L added with 2.
    await savePiece(
      db,
      input({ pieceNumber: "1", ...grid, "c.0.name": "Moss", "c.0.was": "Sage", "c.1.was": "Ink", "s.0.was": "M", "s.1.was": "L", "stock.0.0": "1", "stock.0.1": "", "stock.1.1": "2" }),
      { productId: id, actorId },
    );
    expect(await active(id)).toEqual(["Ink/L:2", "Ink/M:3", "Moss/M:1"]);
    const all = await variantsOf(id);
    expect(all.find((v) => v.id === sageM.id)).toMatchObject({ color: "Moss", onHand: 1 });
    expect(all.find((v) => v.color === "Moss" && v.size === "L")).toMatchObject({ isActive: false });
    expect(await movementSum(db, sageM.id)).toBe(1);
    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, sageM.id));
    expect(moves.map((m) => [m.movementType, m.quantityDelta])).toEqual([
      ["receipt", 2],
      ["adjustment", -1],
    ]);

    // Bringing a retired combination back reactivates it rather than duplicating it.
    await savePiece(db, input({ pieceNumber: "1", ...grid, "c.0.name": "Moss", "c.0.was": "Moss", "c.1.was": "Ink", "s.0.was": "M", "s.1.was": "L", "stock.0.1": "4" }), { productId: id, actorId });
    expect((await variantsOf(id)).filter((v) => v.color === "Moss" && v.size === "L")).toHaveLength(1);
  });

  it("a renamed colour keeps its photos", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", ...grid }), { actorId });
    const url = (n: number) => `https://res.cloudinary.com/demo/image/upload/v1/astitva/pieces/p${n}.jpg`;
    await db.insert(productImages).values([
      { productId: id, url: url(1), color: "Sage", sortOrder: 0 },
      { productId: id, url: url(2), color: "Ink", sortOrder: 1 },
      { productId: id, url: url(3), color: null, sortOrder: 2 },
    ]);
    await savePiece(db, input({ pieceNumber: "1", ...grid, "c.0.name": "Moss", "c.0.was": "Sage", "c.1.was": "Ink", "s.0.was": "M", "s.1.was": "L" }), { productId: id, actorId });
    const photos = await db.select({ url: productImages.url, color: productImages.color }).from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder));
    expect(photos.map((p) => p.color)).toEqual(["Moss", "Ink", null]);
  });

  it("a sale while the editor is open isn't undone by saving it", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", ...grid }), { actorId });
    const inkM = (await variantsOf(id)).find((v) => v.color === "Ink" && v.size === "M")!;
    await db.update(products).set({ status: "active", publishedAt: new Date() }).where(eq(products.id, id));
    const opened = { ...grid, "c.0.was": "Sage", "c.1.was": "Ink", "s.0.was": "M", "s.1.was": "L", "seen.0.0": "2", "seen.0.1": "1", "seen.1.0": "3" };

    // Someone buys one Ink/M (3 → 2) while Krishna edits the story.
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: inkM.id, quantity: 1 }], mode: "commit" }));
    await savePiece(db, input({ pieceNumber: "1", ...opened, story: "New words" }), { productId: id, actorId });
    expect(await active(id)).toEqual(["Ink/M:2", "Sage/L:1", "Sage/M:2"]);

    // She adds two Ink/M to the 3 she saw: 2 left after the sale, plus 2.
    await savePiece(db, input({ pieceNumber: "1", ...opened, "stock.1.0": "5" }), { productId: id, actorId });
    expect(await active(id)).toEqual(["Ink/M:4", "Sage/L:1", "Sage/M:2"]);
    expect(await movementSum(db, inkM.id)).toBe(4);

    // Taking away more than are left now is refused, not taken below zero.
    await expectRule(savePiece(db, input({ pieceNumber: "1", ...opened, "seen.1.0": "9", "stock.1.0": "0" }), { productId: id, actorId }), "stock.1.0");
  });

  it("won't count stock below what's in customers' bags", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", ...grid }), { actorId });
    const inkM = (await variantsOf(id)).find((v) => v.color === "Ink" && v.size === "M")!;
    await db.update(products).set({ status: "active", publishedAt: new Date() }).where(eq(products.id, id));
    const order = await createOrder(db);
    await db.transaction((tx) => reserveForOrder(tx, { orderId: order.id, lines: [{ variantId: inkM.id, quantity: 3 }], mode: "hold", ttlMinutes: 15 }));
    await expectRule(
      savePiece(db, input({ pieceNumber: "1", ...grid, "c.0.was": "Sage", "c.1.was": "Ink", "s.0.was": "M", "s.1.was": "L", "stock.1.0": "1" }), { productId: id, actorId }),
      "stock.1.0",
    );
  });

  it("refuses a taken number, needs stock to publish, and fixes number and address once published", async () => {
    await savePiece(db, input({ pieceNumber: "3", ...grid }), { actorId });
    await expectRule(savePiece(db, input({ pieceNumber: "3", pieceName: "Mitti", ...grid }), { actorId }), "pieceNumber");

    const id = await savePiece(db, input({ pieceName: "Kahwa", "c.0.name": "", "s.0.name": "Free size", "stock.0.0": "0" }), { actorId });
    await expectRule(setPieceStatus(db, id, "active", actorId), "form"); // no number yet
    const edit = (fields: Record<string, string>) =>
      savePiece(db, input({ pieceName: "Kahwa", "c.0.name": "", "s.0.name": "Free size", "s.0.was": "Free size", "stock.0.0": "1", ...fields }), { productId: id, actorId });
    await edit({ pieceNumber: "9" });
    await setPieceStatus(db, id, "active", actorId);
    await expectRule(edit({ pieceNumber: "10" }), "pieceNumber");
    await expectRule(edit({ pieceNumber: "9", slug: "kahwa" }), "slug");
    await edit({ pieceNumber: "9", story: "Warm brown." });
    const [p] = await db.select().from(products).where(and(eq(products.id, id)));
    expect(p).toMatchObject({ status: "active", story: "Warm brown." });
    await expect(setPieceStatus(db, id, "draft", actorId)).rejects.toThrow(/cannot move/);
  });
});
