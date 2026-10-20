import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, inventoryMovements, productVariants, products, users } from "../../src/db/schema";
import { parsePieceForm, type PieceInput } from "../../src/modules/catalog-admin/input";
import {
  changePieceStock,
  nextPieceNumber,
  PieceRuleError,
  savePiece,
  setPieceStatus,
} from "../../src/modules/catalog-admin/service";
import { hasDb, makeDb, movementSum, onHand, resetData } from "./helpers";

function input(fields: Record<string, string>): PieceInput {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name: "Olive linen wrap dress", "v.0.priceMinor": "3499", "v.0.isActive": "on", ...fields })) {
    f.append(k, v);
  }
  const r = parsePieceForm(f);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

async function expectRule(p: Promise<unknown>, field: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PieceRuleError);
  expect(Object.keys((err as PieceRuleError).errors)).toContain(field);
}

describe.skipIf(!hasDb)("piece editor writes", () => {
  const db = makeDb(4);
  let actorId: string;

  beforeEach(async () => {
    await resetData(db);
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    actorId = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("creates a draft whose opening stock is a recorded receipt", async () => {
    const id = await savePiece(db, input({ pieceNumber: "7", pieceName: "Neem", "v.0.initialStock": "1" }), { actorId });
    const [p] = await db.select().from(products).where(eq(products.id, id));
    expect(p).toMatchObject({ status: "draft", slug: "neem-olive-linen-wrap-dress", pieceNumber: 7, publishedAt: null });

    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, id));
    expect(v!.priceMinor).toBe(349_900);
    expect(await onHand(db, v!.id)).toBe(1);
    expect(await movementSum(db, v!.id)).toBe(1);
    const [m] = await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, v!.id));
    expect(m).toMatchObject({ movementType: "receipt", actorId });

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, id));
    expect(audit.map((a) => a.action)).toEqual(["piece.created"]);
    expect(await nextPieceNumber(db)).toBe(8);
  });

  it("refuses a piece number that's already taken", async () => {
    await savePiece(db, input({ pieceNumber: "3", pieceName: "Jamun" }), { actorId });
    await expectRule(savePiece(db, input({ pieceNumber: "3", pieceName: "Mitti" }), { actorId }), "pieceNumber");
  });

  it("won't publish an incomplete piece, and fixes number and address once published", async () => {
    const id = await savePiece(db, input({ pieceName: "Neem" }), { actorId });
    await expectRule(setPieceStatus(db, id, "active", actorId), "form");
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, id));
    const edit = (fields: Record<string, string>) =>
      savePiece(db, input({ pieceName: "Neem", "v.0.id": v!.id, ...fields }), { productId: id, actorId });

    await edit({ pieceNumber: "9" });
    await setPieceStatus(db, id, "active", actorId);
    const [p] = await db.select().from(products).where(eq(products.id, id));
    expect(p!.status).toBe("active");
    expect(p!.publishedAt).toBeInstanceOf(Date);

    await expectRule(edit({ pieceNumber: "10" }), "pieceNumber");
    await expectRule(edit({ pieceNumber: "9", slug: "neem" }), "slug");
    // Other fields still change.
    await edit({ pieceNumber: "9", story: "Found on a slow afternoon." });

    // Hidden and back again keeps the original publish date; it never returns to draft.
    await setPieceStatus(db, id, "archived", actorId);
    await setPieceStatus(db, id, "active", actorId);
    const [again] = await db.select().from(products).where(eq(products.id, id));
    expect(again!.publishedAt).toEqual(p!.publishedAt);
    await expect(setPieceStatus(db, id, "draft", actorId)).rejects.toThrow(/cannot move/);
  });

  it("changes stock only through recorded movements, and not below what's held", async () => {
    const id = await savePiece(db, input({ pieceNumber: "4", pieceName: "Chandni", "v.0.initialStock": "1" }), { actorId });
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, id));

    await changePieceStock(db, id, { variantId: v!.id, delta: 2, type: "receipt", reason: "Found two more" }, actorId);
    await changePieceStock(db, id, { variantId: v!.id, delta: -1, type: "damage", reason: "Torn seam" }, actorId);
    expect(await onHand(db, v!.id)).toBe(2);
    expect(await movementSum(db, v!.id)).toBe(2);
    await expect(
      changePieceStock(db, id, { variantId: v!.id, delta: -5, type: "adjustment", reason: "Recount" }, actorId),
    ).rejects.toThrow(/Insufficient stock/);

    // A size from another piece is refused.
    const other = await savePiece(db, input({ pieceNumber: "5", pieceName: "Mitti" }), { actorId });
    await expectRule(changePieceStock(db, other, { variantId: v!.id, delta: 1, type: "receipt", reason: "x x x" }, actorId), "form");
  });

  it("edits sizes in place, adds new ones, and refuses a size from another piece", async () => {
    const id = await savePiece(db, input({ pieceNumber: "1", pieceName: "Saanjh" }), { actorId });
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, id));
    await savePiece(
      db,
      input({
        pieceNumber: "1",
        pieceName: "Saanjh",
        "v.0.id": v!.id,
        "v.0.size": "S",
        "v.0.priceMinor": "2999",
        "v.0.isActive": "on",
        "v.1.size": "M",
        "v.1.priceMinor": "2999",
        "v.1.isActive": "on",
        "v.1.initialStock": "0",
      }),
      { productId: id, actorId },
    );
    const sizes = await db.select().from(productVariants).where(eq(productVariants.productId, id));
    expect(sizes.map((s) => [s.size, s.priceMinor]).sort()).toEqual([
      ["M", 299_900],
      ["S", 299_900],
    ]);

    const other = await savePiece(db, input({ pieceNumber: "2", pieceName: "Jamun" }), { actorId });
    await expectRule(
      savePiece(db, input({ pieceNumber: "2", pieceName: "Jamun", "v.0.id": v!.id }), { productId: other, actorId }),
      "form",
    );
  });
});
