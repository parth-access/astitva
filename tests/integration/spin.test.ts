import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, products, users } from "../../src/db/schema";
import { setSpinVideo } from "../../src/modules/catalog-admin/spin";
import { PieceRuleError } from "../../src/modules/catalog-admin/service";
import { hasDb, makeDb, resetData } from "./helpers";

const video = (n: number) => `https://res.cloudinary.com/demo/video/upload/v1/astitva/spins/t${n}.mp4`;

describe.skipIf(!hasDb)("piece turning video", () => {
  const db = makeDb(2);
  let actorId: string;
  let productId: string;
  const piece = async () => (await db.select().from(products).where(eq(products.id, productId)))[0]!;

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

  it("sets, replaces and removes the video, handing back the old one to delete, without touching updated_at", async () => {
    const before = (await piece()).updatedAt;
    expect(await setSpinVideo(db, productId, video(1), actorId)).toBeNull();
    expect(await setSpinVideo(db, productId, video(2), actorId)).toBe(video(1));
    expect((await piece()).spinVideoUrl).toBe(video(2));
    expect(await setSpinVideo(db, productId, null, actorId)).toBe(video(2));
    expect(await setSpinVideo(db, productId, null, actorId)).toBeNull();
    const after = await piece();
    expect(after.spinVideoUrl).toBeNull();
    expect(after.updatedAt).toEqual(before);
    const audit = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.resourceId, productId));
    expect(audit.map((a) => a.action).sort()).toEqual(["piece.spin_added", "piece.spin_added", "piece.spin_removed"]);
  });

  it("refuses a piece that's gone", async () => {
    await expect(setSpinVideo(db, "00000000-0000-4000-8000-000000000000", video(1), actorId)).rejects.toBeInstanceOf(PieceRuleError);
  });
});
