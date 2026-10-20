import { eq, max } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/db/create";
import { auditLogs, chapters } from "@/db/schema";
import { chapterMachine, type ChapterStatus } from "@/modules/orders/machines";
import type { VerifiedPhoto } from "@/modules/media/cloudinary";
import { SLUG_PATTERN, slugify } from "./fields";
import { formValues, type FieldErrors } from "./input";
import { PieceRuleError } from "./service";

/**
 * Chapters (releases) for the admin: the form, saving, publishing and the
 * cover photo. While a chapter is published its number and web address are
 * fixed; it needs a release date to be published (also a database rule).
 */

const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const text = (maxLen: number) =>
  z.preprocess(blank, z.string().trim().max(maxLen, `Keep this under ${maxLen} characters.`).nullable());

/** "2026-11-01T18:00" typed in India time → the instant. */
export function istToDate(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const IST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The instant → "2026-11-01T18:00" in India time, for a datetime-local field. */
export function dateToIst(d: Date): string {
  const p = Object.fromEntries(IST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const chapterSchema = z.object({
  number: z.coerce.number({ message: "Enter a number." }).int("Whole numbers only.").min(1, "Must be 1 or more.").max(999),
  title: z.string().trim().min(1, "Give the chapter a title.").max(80, "Keep this under 80 characters."),
  subtitle: text(200),
  slug: z.preprocess(blank, z.string().trim().max(96).regex(SLUG_PATTERN, "Lowercase letters, numbers and dashes only.").nullable()),
  letter: z.preprocess((v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : ""), z.string().max(20_000)),
  letterSignature: text(60),
  tone: z.preprocess(blank, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #6b6b46.").nullable()),
  releaseAt: z.preprocess(
    blank,
    z
      .string()
      .transform((v, ctx) => istToDate(v) ?? (ctx.addIssue({ code: "custom", message: "Pick a date and time." }), z.NEVER))
      .nullable(),
  ),
  coverImageAlt: text(240),
});

export type ChapterInput = Omit<z.infer<typeof chapterSchema>, "slug"> & { slug: string };

export function parseChapterForm(form: FormData): { ok: true; data: ChapterInput } | { ok: false; errors: FieldErrors } {
  const parsed = chapterSchema.safeParse(formValues(form));
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
    return { ok: false, errors };
  }
  const slug = parsed.data.slug ?? slugify(parsed.data.title);
  if (!slug) return { ok: false, errors: { slug: "Add a web address." } };
  return { ok: true, data: { ...parsed.data, slug, tone: parsed.data.tone?.toLowerCase() ?? null } };
}

const UNIQUE: Record<string, [string, string]> = {
  chapters_number_unique: ["number", "Another chapter already has this number."],
  chapters_slug_unique: ["slug", "Another chapter already uses this web address."],
};

export async function nextChapterNumber(db: Db | Tx): Promise<number> {
  const [row] = await db.select({ n: max(chapters.number) }).from(chapters);
  return (row?.n ?? 0) + 1;
}

export async function saveChapter(db: Db, input: ChapterInput, ctx: { chapterId?: string; actorId: string }): Promise<string> {
  try {
    return await db.transaction(async (tx) => {
      let id = ctx.chapterId;
      const values = {
        number: input.number,
        title: input.title,
        subtitle: input.subtitle,
        slug: input.slug,
        letter: input.letter,
        letterSignature: input.letterSignature,
        tone: input.tone,
        releaseAt: input.releaseAt,
        coverImageAlt: input.coverImageAlt,
      };
      if (id) {
        const [current] = await tx.select().from(chapters).where(eq(chapters.id, id)).for("update");
        if (!current) throw new PieceRuleError({ form: "This chapter no longer exists." });
        if (current.status === "published") {
          const locked: FieldErrors = {};
          if (current.number !== input.number) locked.number = "Unpublish the chapter to change its number.";
          if (current.slug !== input.slug) locked.slug = "Unpublish the chapter to change its web address.";
          if (!input.releaseAt) locked.releaseAt = "A published chapter needs a release date.";
          if (Object.keys(locked).length) throw new PieceRuleError(locked);
        }
        await tx.update(chapters).set(values).where(eq(chapters.id, id));
      } else {
        const [created] = await tx.insert(chapters).values(values).returning({ id: chapters.id });
        id = created!.id;
      }
      await tx.insert(auditLogs).values({
        actorId: ctx.actorId,
        action: ctx.chapterId ? "chapter.updated" : "chapter.created",
        resourceType: "chapter",
        resourceId: id,
        metadata: { number: input.number, slug: input.slug },
      });
      return id;
    });
  } catch (err) {
    if (err instanceof PieceRuleError) throw err;
    const pg = (err as { cause?: { code?: string; constraint?: string } }).cause ?? (err as { code?: string; constraint?: string });
    const hit = pg?.code === "23505" && pg.constraint ? UNIQUE[pg.constraint] : undefined;
    if (hit) throw new PieceRuleError({ [hit[0]]: hit[1] });
    throw err;
  }
}

export async function setChapterStatus(db: Db, chapterId: string, to: ChapterStatus, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(chapters).where(eq(chapters.id, chapterId)).for("update");
    if (!c) throw new PieceRuleError({ form: "This chapter no longer exists." });
    chapterMachine.assertTransition(c.status, to);
    if (to === "published" && !c.releaseAt) throw new PieceRuleError({ form: "Set a release date before publishing." });
    await tx.update(chapters).set({ status: to }).where(eq(chapters.id, chapterId));
    await tx.insert(auditLogs).values({
      actorId,
      action: `chapter.status.${to}`,
      resourceType: "chapter",
      resourceId: chapterId,
      metadata: { from: c.status, to },
    });
  });
}

/** Sets or clears the cover photo. Returns the previous photo's address so its file can be deleted. */
export async function setChapterCover(db: Db, chapterId: string, photo: VerifiedPhoto | null, actorId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(chapters).where(eq(chapters.id, chapterId)).for("update");
    if (!c) throw new PieceRuleError({ form: "This chapter no longer exists." });
    await tx
      .update(chapters)
      .set({ coverImageUrl: photo?.url ?? null, ...(photo?.tone && !c.tone ? { tone: photo.tone } : {}) })
      .where(eq(chapters.id, chapterId));
    await tx.insert(auditLogs).values({
      actorId,
      action: photo ? "chapter.cover_set" : "chapter.cover_removed",
      resourceType: "chapter",
      resourceId: chapterId,
      metadata: { url: photo?.url ?? null, previous: c.coverImageUrl },
    });
    return c.coverImageUrl;
  });
}
