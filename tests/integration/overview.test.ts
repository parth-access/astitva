import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { storeSettings, users } from "../../src/db/schema";
import { addToBag, openBag } from "../../src/modules/bag/service";
import { packOrder } from "../../src/modules/orders/fulfilment";
import { getOverview } from "../../src/modules/orders/overview";
import { cancelOrder } from "../../src/modules/orders/service";
import { createVariant, hasDb, makeDb, placePaid, resetData } from "./helpers";

describe.skipIf(!hasDb)("the admin's Today numbers", () => {
  const db = makeDb(2);
  let admin: string;

  async function paidOrder(phone: string) {
    const v = await createVariant(db, { onHand: 3, priceMinor: 200_000 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id);
    return placePaid(db, bag.id, {
      idempotencyKey: randomUUID(),
      contact: { name: "Asha Rao", phone, email: null },
      address: { recipientName: "Asha Rao", phone, line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
      note: null,
      discountCode: null,
    });
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    admin = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("counts what's waiting and what sold, leaving out cancelled orders", async () => {
    await paidOrder("9811111111");
    const b = await paidOrder("9822222222");
    const c = await paidOrder("9833333333");
    expect(await getOverview(db)).toMatchObject({ toPack: 3, week: { orders: 3, minor: 600_000 } });

    await packOrder(db, b.orderId, admin);
    await cancelOrder(db, c.orderId, admin, "Buyer changed their mind");
    expect(await getOverview(db)).toMatchObject({
      needsYou: 1, // cancelled after payment: a refund is due
      toPack: 1,
      toShip: 1,
      onTheWay: 0,
      week: { orders: 2, minor: 400_000 },
      month: { orders: 2, minor: 400_000 },
    });
  });
});
