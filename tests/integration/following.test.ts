import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { carts, products, savedPieces, users } from "../../src/db/schema";
import { getAddress, saveAddress } from "../../src/modules/account/service";
import { listSavedIds, MAX_SAVED, savePiece, unsavePiece } from "../../src/modules/account/saved";
import { addToBag, claimGuestBag, findAccountBag, findBag, openAccountBag, openBag, readBag } from "../../src/modules/bag/service";
import { createVariant, hasDb, makeDb, resetData } from "./helpers";

describe.skipIf(!hasDb)("what follows a customer's account", () => {
  const db = makeDb(8);

  async function customer(email = "meera@example.com") {
    const [u] = await db.insert(users).values({ name: "Meera", email, emailVerified: true }).returning();
    return u!.id;
  }

  beforeEach(async () => {
    await resetData(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  describe("the bag", () => {
    it("becomes the account's when there was none, and the cookie no longer finds it", async () => {
      const userId = await customer();
      const v = await createVariant(db, { onHand: 3 });
      const guest = await openBag(db, null);
      await addToBag(db, guest.id, v.id, 2);

      expect(await claimGuestBag(db, guest.newToken, userId)).toBe(true);
      expect((await findAccountBag(db, userId))?.id).toBe(guest.id);
      // Signed out on this device: the account's bag stays with the account.
      expect(await findBag(db, guest.newToken)).toBeNull();
      expect(await claimGuestBag(db, guest.newToken, userId)).toBe(false);
    });

    it("joins the account's bag, adding up the same piece to the most allowed", async () => {
      const userId = await customer();
      const a = await createVariant(db, { onHand: 20 });
      const b = await createVariant(db, { onHand: 5 });
      const account = await openAccountBag(db, userId);
      await addToBag(db, account.id, a.id, 6);

      const guest = await openBag(db, null);
      await addToBag(db, guest.id, a.id, 7);
      await addToBag(db, guest.id, b.id, 1);
      expect(await claimGuestBag(db, guest.newToken, userId)).toBe(true);

      const bag = await readBag(db, account.id);
      expect(bag.lines.map((l) => [l.variantId, l.quantity])).toEqual([
        [a.id, 10],
        [b.id, 1],
      ]);
      expect(await db.select().from(carts).where(eq(carts.id, guest.id))).toHaveLength(0);
    });

    it("is the same bag on every device, and one bag however many first adds race", async () => {
      const userId = await customer();
      const [one, two] = await Promise.all([openAccountBag(db, userId), openAccountBag(db, userId)]);
      expect(one.id).toBe(two.id);
      expect(await db.select().from(carts).where(eq(carts.userId, userId))).toHaveLength(1);
    });

    it("never takes another customer's bag", async () => {
      const meera = await customer();
      const asha = await customer("asha@example.com");
      const v = await createVariant(db, { onHand: 3 });
      const guest = await openBag(db, null);
      await addToBag(db, guest.id, v.id);
      await claimGuestBag(db, guest.newToken, meera);
      expect(await claimGuestBag(db, guest.newToken, asha)).toBe(false);
      expect(await findAccountBag(db, asha)).toBeNull();
    });
  });

  describe("saved addresses at checkout", () => {
    it("reads only the customer's own", async () => {
      const meera = await customer();
      const asha = await customer("asha@example.com");
      const home = await saveAddress(db, meera, { name: "Meera", phone: "9812345678", line1: "12 Lake Road", line2: null, landmark: null, city: "Pune", state: "Maharashtra", pincode: "411001" });
      expect((await getAddress(db, meera, home.id))?.line1).toBe("12 Lake Road");
      expect(await getAddress(db, asha, home.id)).toBeNull();
    });
  });

  describe("hearts", () => {
    it("saves published styles once each, newest first, and lets them go", async () => {
      const userId = await customer();
      const a = await createVariant(db, { onHand: 1 });
      const b = await createVariant(db, { onHand: 0 });
      const draft = await createVariant(db, { onHand: 1, status: "draft" });

      expect(await savePiece(db, userId, a.productId)).toBe("saved");
      expect(await savePiece(db, userId, b.productId)).toBe("saved");
      expect(await savePiece(db, userId, a.productId)).toBe("saved");
      expect(await savePiece(db, userId, draft.productId)).toBe("unavailable");
      expect(await listSavedIds(db, userId)).toEqual([b.productId, a.productId]);

      await unsavePiece(db, userId, b.productId);
      expect(await listSavedIds(db, userId)).toEqual([a.productId]);
    });

    it("keeps at most MAX_SAVED", async () => {
      const userId = await customer();
      const v = await createVariant(db, { onHand: 1 });
      const [p] = await db.select().from(products).where(eq(products.id, v.productId));
      const extra = Array.from({ length: MAX_SAVED }, (_, i) => ({ ...p!, id: undefined, slug: `${p!.slug}-${i}`, pieceNumber: null }));
      const made = await db.insert(products).values(extra).returning({ id: products.id });
      await db.insert(savedPieces).values(made.map((m) => ({ userId, productId: m.id })));
      expect(await savePiece(db, userId, v.productId)).toBe("full");
    });
  });
});
