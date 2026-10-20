import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chapters, users } from "../../src/db/schema";
import { dateToIst, istToDate, nextChapterNumber, parseChapterForm, saveChapter, setChapterCover, setChapterStatus, type ChapterInput } from "../../src/modules/catalog-admin/chapters";
import { PieceRuleError } from "../../src/modules/catalog-admin/service";
import { hasDb, makeDb, resetData } from "./helpers";

function input(fields: Record<string, string>): ChapterInput {
  const f = new FormData();
  for (const [k, v] of Object.entries({ number: "1", title: "Aarambh", ...fields })) f.append(k, v);
  const r = parseChapterForm(f);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

async function expectRule(p: Promise<unknown>, field: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PieceRuleError);
  expect(Object.keys((err as PieceRuleError).errors)).toContain(field);
}

describe("chapter dates", () => {
  it("reads and writes release times in India time", () => {
    const d = istToDate("2026-11-01T18:00")!;
    expect(d.toISOString()).toBe("2026-11-01T12:30:00.000Z");
    expect(dateToIst(d)).toBe("2026-11-01T18:00");
    expect(istToDate("1 Nov")).toBeNull();
  });

  it("keeps the letter's paragraphs and makes the web address from the title", () => {
    const f = new FormData();
    f.append("number", "2");
    f.append("title", "Saanjh Ki Baat");
    f.append("letter", "  First paragraph.\r\n\r\nSecond.  ");
    const r = parseChapterForm(f);
    expect(r.ok && r.data).toMatchObject({ slug: "saanjh-ki-baat", letter: "First paragraph.\n\nSecond.", releaseAt: null });
  });
});

describe.skipIf(!hasDb)("chapter editor writes", () => {
  const db = makeDb(4);
  let actorId: string;

  beforeEach(async () => {
    await resetData(db);
    await db.delete(chapters);
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    actorId = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("needs a release date to publish, then fixes number and address until unpublished", async () => {
    const id = await saveChapter(db, input({}), { actorId });
    expect(await nextChapterNumber(db)).toBe(2);
    await expectRule(setChapterStatus(db, id, "published", actorId), "form");

    await saveChapter(db, input({ releaseAt: "2026-11-01T18:00" }), { chapterId: id, actorId });
    await setChapterStatus(db, id, "published", actorId);
    await expectRule(saveChapter(db, input({ number: "2", releaseAt: "2026-11-01T18:00" }), { chapterId: id, actorId }), "number");
    await expectRule(saveChapter(db, input({ slug: "begin", releaseAt: "2026-11-01T18:00" }), { chapterId: id, actorId }), "slug");
    await expectRule(saveChapter(db, input({}), { chapterId: id, actorId }), "releaseAt");

    await setChapterStatus(db, id, "draft", actorId);
    await saveChapter(db, input({ slug: "begin" }), { chapterId: id, actorId });
    const [c] = await db.select().from(chapters).where(eq(chapters.id, id));
    expect(c).toMatchObject({ status: "draft", slug: "begin" });
  });

  it("refuses a chapter number that's taken", async () => {
    await saveChapter(db, input({}), { actorId });
    await expectRule(saveChapter(db, input({ title: "Another" }), { actorId }), "number");
  });

  it("replaces the cover and returns the old one for deletion", async () => {
    const id = await saveChapter(db, input({}), { actorId });
    const photo = (n: number) => ({
      publicId: `astitva/chapters/c${n}`,
      url: `https://res.cloudinary.com/demo/image/upload/v1/astitva/chapters/c${n}.jpg`,
      width: 1200,
      height: 1600,
      tone: "#a33b2e",
    });
    expect(await setChapterCover(db, id, photo(1), actorId)).toBeNull();
    expect(await setChapterCover(db, id, photo(2), actorId)).toBe(photo(1).url);
    expect(await setChapterCover(db, id, null, actorId)).toBe(photo(2).url);
    const [c] = await db.select().from(chapters).where(eq(chapters.id, id));
    expect(c).toMatchObject({ coverImageUrl: null, tone: "#a33b2e" });
  });
});
