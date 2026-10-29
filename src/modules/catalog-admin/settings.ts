import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/create";
import { auditLogs, products, storeSettings } from "@/db/schema";
import { CONTENTS_PLACES } from "@/modules/catalog/contents";
import { whatsappNumber } from "@/lib/india";
import { rupeesToPaise } from "@/lib/money";
import { formValues, type FieldErrors } from "./input";

/**
 * The store settings Krishna edits: the home page lookbook's words, whether
 * ordering is open, what delivery and cash on delivery cost, and how
 * customers reach her. Amounts are typed in rupees and stored as paise.
 */

const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable());

const rupees = (label: string) =>
  z.string({ message: `${label}: enter rupees.` }).transform((v, ctx) => {
    try {
      return rupeesToPaise(v.replace(/[,₹\s]/g, "") || "0");
    } catch {
      ctx.addIssue({ code: "custom", message: `${label}: enter rupees, like 99 or 5000.` });
      return z.NEVER;
    }
  });

const settingsSchema = z.object({
  lookbookTitle: text(80),
  lookbookSubtitle: text(200),
  note: z.preprocess((v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : ""), z.string().max(20_000)),
  noteSignature: text(60),
  orderingOpen: z.boolean(),
  supportWhatsapp: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s+()-]/g, "") || null : v),
    z.string().regex(/^[0-9]{10,15}$/, "Digits with the country code, e.g. 919812345678.").nullable().transform(whatsappNumber),
  ),
  conciergeName: text(40),
  supportEmail: z.preprocess(blank, z.email("An email address.").nullable()),
  profileLinks: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : []),
    z
      .array(z.url({ protocol: /^https$/, message: "Each link starting https://, one per line." }).max(300, "That link is too long."))
      .max(8, "Up to 8 links.")
      .transform((links) => [...new Set(links)]),
  ),
  shippingFlatMinor: rupees("Shipping"),
  freeShippingThresholdMinor: z.preprocess(blank, rupees("Free shipping from").nullable()),
  codEnabled: z.boolean(),
  codFeeMinor: rupees("Cash-on-delivery fee"),
  codMaxOrderMinor: rupees("Cash-on-delivery limit").refine((v) => v > 0, "Above ₹0, or switch cash on delivery off."),
  // Places on the home page's Contents page; a blank place is filled at random. The same piece twice counts once.
  contentsPicks: z.array(z.uuid()).transform((ids) => [...new Set(ids)].slice(0, CONTENTS_PLACES)),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export function parseSettingsForm(form: FormData): { ok: true; data: SettingsInput } | { ok: false; errors: FieldErrors } {
  const values = formValues(form);
  const picks = Array.from({ length: CONTENTS_PLACES }, (_, i) => values[`contentsPick${i}`] ?? "").filter(Boolean);
  const parsed = settingsSchema.safeParse({ ...values, orderingOpen: values.orderingOpen === "on", codEnabled: values.codEnabled === "on", contentsPicks: picks });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  // By field: a bad profile link reports on the links box, not its line.
  for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { ok: false, errors };
}

export async function saveSettings(db: Db, input: SettingsInput, actorId: string) {
  await db.transaction(async (tx) => {
    // Only published pieces can be chosen for the Contents page: anything else is dropped, and its place is filled at random.
    if (input.contentsPicks.length) {
      const live = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(inArray(products.id, input.contentsPicks), eq(products.status, "active")));
      input = { ...input, contentsPicks: input.contentsPicks.filter((id) => live.some((p) => p.id === id)) };
    }
    await tx.insert(storeSettings).values({ id: 1, ...input }).onConflictDoUpdate({ target: storeSettings.id, set: input });
    await tx.insert(auditLogs).values({
      actorId,
      action: "settings.updated",
      resourceType: "store_settings",
      resourceId: "1",
      metadata: {
        orderingOpen: input.orderingOpen,
        codEnabled: input.codEnabled,
        codFeeMinor: input.codFeeMinor,
        codMaxOrderMinor: input.codMaxOrderMinor,
        shippingFlatMinor: input.shippingFlatMinor,
        freeShippingThresholdMinor: input.freeShippingThresholdMinor,
        contentsPicks: input.contentsPicks,
      },
    });
  });
}

export async function settingsRow(db: Db) {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return s ?? null;
}

/** Published pieces in house order, to choose the Contents page's from. */
export async function publishedPieces(db: Db) {
  return db
    .select({ id: products.id, pieceNumber: products.pieceNumber, pieceName: products.pieceName, name: products.name })
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(sql`${products.pieceNumber} asc nulls last`, asc(products.name));
}
