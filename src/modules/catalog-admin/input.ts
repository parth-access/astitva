import { z } from "zod";
import type { itemCondition, Measurements } from "@/db/schema";
import { rupeesToPaise } from "@/lib/money";
import { CONDITIONS, MEASUREMENT_FIELDS, SLUG_PATTERN, slugify } from "./fields";

// The form's condition list must stay in step with the database enum.
true satisfies (typeof CONDITIONS)[number] extends (typeof itemCondition.enumValues)[number]
  ? (typeof itemCondition.enumValues)[number] extends (typeof CONDITIONS)[number]
    ? true
    : false
  : false;

/**
 * The piece editor's form, parsed and validated on the server. Field names in
 * the form match the keys here; sizes are `v.<row>.<field>`. Errors come back
 * keyed the same way so the form can show each one next to its field.
 */

/** An empty or missing field is null. */
const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable());
const longText = z.preprocess(blank, z.string().trim().max(10_000).nullable());

const rupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        return rupeesToPaise(v.replace(/[,₹\s]/g, ""));
      } catch {
        ctx.addIssue({ code: "custom", message: `${label}: enter rupees, like 3499 or 3499.50.` });
        return z.NEVER;
      }
    });
const optionalRupees = (label: string) => z.preprocess(blank, rupees(label).nullable());

const cm = z.preprocess(
  blank,
  z.coerce.number({ message: "Enter centimetres as a number." }).positive("Must be more than 0.").max(400, "That's more than 4 metres.").nullable(),
);

const variantSchema = z
  .object({
    id: z.preprocess(blank, z.uuid().nullable()),
    size: optionalText(24),
    priceMinor: rupees("Price"),
    compareAtMinor: optionalRupees("Original price"),
    condition: z.preprocess(blank, z.enum(CONDITIONS).nullable()),
    isActive: z.boolean(),
    initialStock: z.preprocess(
      blank,
      z.coerce.number().int("Whole pieces only.").min(0, "Can't be negative.").max(999).nullable(),
    ),
    acquisitionCostMinor: optionalRupees("Cost"),
    acquiredAt: z.preprocess(blank, z.iso.date("Pick a date.").nullable()),
    internalRef: optionalText(120),
    ...Object.fromEntries(MEASUREMENT_FIELDS.map(([key]) => [key, cm])),
  })
  .superRefine((v, ctx) => {
    if (v.compareAtMinor !== null && v.compareAtMinor <= v.priceMinor) {
      ctx.addIssue({ code: "custom", path: ["compareAtMinor"], message: "The original price must be higher than the price." });
    }
  });

const pieceSchema = z.object({
  pieceNumber: z.preprocess(
    blank,
    z.coerce.number({ message: "Enter a number." }).int("Whole numbers only.").positive("Must be 1 or more.").max(9999).nullable(),
  ),
  pieceName: optionalText(60),
  name: z.string().trim().min(1, "Describe the piece, e.g. “Olive linen wrap dress”.").max(160),
  slug: z.preprocess(
    blank,
    z.string().trim().max(180).regex(SLUG_PATTERN, "Lowercase letters, numbers and dashes only.").nullable(),
  ),
  chapterId: z.preprocess(blank, z.uuid().nullable()),
  categoryId: z.preprocess(blank, z.uuid().nullable()),
  tone: z.preprocess(blank, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #6b6b46.").nullable()),
  story: longText,
  stylingNote: longText,
  description: longText,
  material: optionalText(160),
  fit: optionalText(160),
  careInstructions: optionalText(1000),
  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
  variants: z.array(variantSchema).min(1, "Add at least one size."),
});

export type PieceInput = Omit<z.infer<typeof pieceSchema>, "slug" | "variants"> & {
  slug: string;
  variants: VariantInput[];
};
export type VariantInput = Omit<z.infer<typeof variantSchema>, (typeof MEASUREMENT_FIELDS)[number][0]> & {
  measurements: Measurements | null;
};

export type FieldErrors = Record<string, string>;
export type ParseResult = { ok: true; data: PieceInput } | { ok: false; errors: FieldErrors };

/** Raw form values by field name, kept so the form can be shown again as typed. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === "string") out[k] = v;
  return out;
}

export function parsePieceForm(form: FormData): ParseResult {
  const values = formValues(form);
  const rows = [...new Set(Object.keys(values).flatMap((k) => /^v\.(\d+)\./.exec(k)?.[1] ?? []))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const raw = {
    ...Object.fromEntries(Object.entries(values).filter(([k]) => !k.startsWith("v."))),
    variants: rows.map((r) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) if (k.startsWith(`v.${r}.`)) row[k.slice(`v.${r}.`.length)] = v;
      row.isActive = values[`v.${r}.isActive`] === "on";
      return row;
    }),
  };

  const parsed = pieceSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const [head, index, ...rest] = issue.path.map(String);
      const key = head === "variants" && index !== undefined ? `v.${rows[Number(index)]}.${rest.join(".")}` : issue.path.join(".");
      errors[key || "form"] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const d = parsed.data;
  const slug = d.slug ?? slugify(d.pieceName, d.name);
  if (!slug) return { ok: false, errors: { slug: "Add a web address." } };
  return {
    ok: true,
    data: {
      ...d,
      slug,
      tone: d.tone?.toLowerCase() ?? null,
      variants: d.variants.map((v) => {
        const measurements: Measurements = {};
        for (const [key] of MEASUREMENT_FIELDS) {
          const value = (v as Record<string, unknown>)[key];
          if (typeof value === "number") measurements[key] = value;
        }
        const rest = { ...v } as Record<string, unknown>;
        for (const [key] of MEASUREMENT_FIELDS) delete rest[key];
        return { ...(rest as Omit<VariantInput, "measurements">), measurements: Object.keys(measurements).length ? measurements : null };
      }),
    },
  };
}
