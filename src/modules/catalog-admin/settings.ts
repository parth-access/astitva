import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/create";
import { auditLogs, storeSettings } from "@/db/schema";
import { formValues, type FieldErrors } from "./input";

/**
 * The store settings Krishna edits: the home page lookbook's words, whether
 * ordering is open, and how customers reach her.
 */

const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable());

const settingsSchema = z.object({
  lookbookTitle: text(80),
  lookbookSubtitle: text(200),
  note: z.preprocess((v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : ""), z.string().max(20_000)),
  noteSignature: text(60),
  orderingOpen: z.boolean(),
  supportWhatsapp: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s+()-]/g, "") || null : v),
    z.string().regex(/^[0-9]{10,15}$/, "Digits with the country code, e.g. 919812345678.").nullable(),
  ),
  conciergeName: text(40),
  supportEmail: z.preprocess(blank, z.email("An email address.").nullable()),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export function parseSettingsForm(form: FormData): { ok: true; data: SettingsInput } | { ok: false; errors: FieldErrors } {
  const values = formValues(form);
  const parsed = settingsSchema.safeParse({ ...values, orderingOpen: values.orderingOpen === "on" });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return { ok: false, errors };
}

export async function saveSettings(db: Db, input: SettingsInput, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.insert(storeSettings).values({ id: 1, ...input }).onConflictDoUpdate({ target: storeSettings.id, set: input });
    await tx.insert(auditLogs).values({
      actorId,
      action: "settings.updated",
      resourceType: "store_settings",
      resourceId: "1",
      metadata: { orderingOpen: input.orderingOpen },
    });
  });
}

export async function settingsRow(db: Db) {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return s ?? null;
}
