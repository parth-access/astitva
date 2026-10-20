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
 * The piece editor's form, parsed and validated on the server.
 *
 * A style is offered in any colours and any sizes. The form sends:
 *   c.<i>.name / c.<i>.hex / c.<i>.was   colours (was = the name before an edit, so a rename keeps its stock)
 *   s.<j>.name / s.<j>.was / s.<j>.<cm>  sizes, with garment measurements per size
 *   stock.<i>.<j>                         how many of colour i in size j; blank = that combination isn't offered
 * Price, condition and the private fields apply to the whole style.
 * Errors come back keyed by field name so the form shows each in place.
 */

/** An empty or missing field is null. */
const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable());
const longText = z.preprocess(blank, z.string().trim().max(10_000).nullable());

const rupees = (label: string) =>
  z
    .string({ message: `${label}: enter rupees.` })
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
const hex = z.preprocess(blank, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #6b6b46.").nullable());
const stockCell = z.preprocess(
  blank,
  z.coerce.number({ message: "A number." }).int("Whole pieces.").min(0, "Not below 0.").max(9999).nullable(),
);

const colourSchema = z.object({ name: optionalText(48), hex, was: optionalText(48) });
const sizeSchema = z.object({
  name: optionalText(24),
  was: optionalText(24),
  ...Object.fromEntries(MEASUREMENT_FIELDS.map(([key]) => [key, cm])),
});

const pieceSchema = z
  .object({
    pieceNumber: z.preprocess(
      blank,
      z.coerce.number({ message: "Enter a number." }).int("Whole numbers only.").positive("Must be 1 or more.").max(9999).nullable(),
    ),
    pieceName: optionalText(60),
    name: z.string().trim().min(1, "Describe the piece, e.g. “Olive linen wrap dress”.").max(160),
    slug: z.preprocess(blank, z.string().trim().max(180).regex(SLUG_PATTERN, "Lowercase letters, numbers and dashes only.").nullable()),
    categoryId: z.preprocess(blank, z.uuid().nullable()),
    tone: hex,
    story: longText,
    stylingNote: longText,
    description: longText,
    material: optionalText(160),
    fit: optionalText(160),
    careInstructions: optionalText(1000),
    seoTitle: optionalText(160),
    seoDescription: optionalText(320),
    priceMinor: rupees("Price"),
    compareAtMinor: optionalRupees("Original price"),
    condition: z.preprocess(blank, z.enum(CONDITIONS).nullable()),
    acquisitionCostMinor: optionalRupees("Cost"),
    acquiredAt: z.preprocess(blank, z.iso.date("Pick a date.").nullable()),
    internalRef: optionalText(120),
    colours: z.array(colourSchema).min(1, "Add at least one colour."),
    sizes: z.array(sizeSchema).min(1, "Add at least one size."),
    stock: z.array(z.array(stockCell)),
  })
  .superRefine((d, ctx) => {
    if (d.compareAtMinor !== null && d.compareAtMinor <= d.priceMinor) {
      ctx.addIssue({ code: "custom", path: ["compareAtMinor"], message: "The original price must be higher than the price." });
    }
    if (!d.stock.some((row) => row.some((n) => n !== null))) {
      ctx.addIssue({ code: "custom", path: ["stock"], message: "Enter stock for at least one colour and size (0 is fine)." });
    }
  });

type Parsed = z.infer<typeof pieceSchema>;
export type ColourInput = { name: string | null; hex: string | null; was: string | null };
export type SizeInput = { name: string | null; was: string | null; measurements: Measurements | null };
export type PieceInput = Omit<Parsed, "slug" | "colours" | "sizes"> & {
  slug: string;
  colours: ColourInput[];
  sizes: SizeInput[];
  /** stock[colour][size]: units in hand, or null where the combination isn't offered. */
  stock: (number | null)[][];
};

export type FieldErrors = Record<string, string>;
export type ParseResult = { ok: true; data: PieceInput } | { ok: false; errors: FieldErrors };

/** Raw form values by field name, kept so the form can be shown again as typed. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === "string") out[k] = v;
  return out;
}

/** Row indexes present for a prefix like "c" (from c.0.name, c.3.hex…), in order. */
function rowsOf(values: Record<string, string>, prefix: string) {
  return [...new Set(Object.keys(values).flatMap((k) => new RegExp(`^${prefix}\\.(\\d+)\\.`).exec(k)?.[1] ?? []))]
    .map(Number)
    .sort((a, b) => a - b);
}

function group(values: Record<string, string>, prefix: string, row: number) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (k.startsWith(`${prefix}.${row}.`)) out[k.slice(`${prefix}.${row}.`.length)] = v;
  return out;
}

/**
 * With more than one colour (or size), each needs a name, and names must
 * differ. Checked on the raw form so these show together with any other error.
 */
function nameErrors(values: Record<string, string>, prefix: "c" | "s", rows: number[], what: string): FieldErrors {
  const errors: FieldErrors = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const name = (values[`${prefix}.${r}.name`] ?? "").trim();
    if (rows.length > 1 && !name) errors[`${prefix}.${r}.name`] = `Name this ${what}.`;
    else if (seen.has(name.toLowerCase())) errors[`${prefix}.${r}.name`] = `Two ${what}s have this name.`;
    seen.add(name.toLowerCase());
  }
  return errors;
}

export function parsePieceForm(form: FormData): ParseResult {
  const values = formValues(form);
  const colourRows = rowsOf(values, "c");
  const sizeRows = rowsOf(values, "s");
  const raw = {
    ...Object.fromEntries(Object.entries(values).filter(([k]) => !/^(c|s|stock)\./.test(k))),
    colours: colourRows.map((i) => group(values, "c", i)),
    sizes: sizeRows.map((j) => group(values, "s", j)),
    stock: colourRows.map((i) => sizeRows.map((j) => values[`stock.${i}.${j}`])),
  };

  const parsed = pieceSchema.safeParse(raw);
  const names = { ...nameErrors(values, "c", colourRows, "colour"), ...nameErrors(values, "s", sizeRows, "size") };
  if (!parsed.success || Object.keys(names).length) {
    const errors: FieldErrors = { ...names };
    for (const issue of parsed.error?.issues ?? []) {
      const [head, a, b] = issue.path;
      const key =
        head === "colours" && a !== undefined
          ? `c.${colourRows[Number(a)]}.${String(b)}`
          : head === "sizes" && a !== undefined
            ? `s.${sizeRows[Number(a)]}.${String(b)}`
            : head === "stock" && a !== undefined && b !== undefined
              ? `stock.${colourRows[Number(a)]}.${sizeRows[Number(b)]}`
              : issue.path.join(".");
      errors[key || "form"] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const d = parsed.data!;
  const slug = d.slug ?? slugify(d.pieceName, d.name);
  if (!slug) return { ok: false, errors: { slug: "Add a web address." } };
  return {
    ok: true,
    data: {
      ...d,
      slug,
      tone: d.tone?.toLowerCase() ?? null,
      colours: d.colours.map((c) => ({ name: c.name, hex: c.hex?.toLowerCase() ?? null, was: c.was })),
      sizes: d.sizes.map((s) => {
        const measurements: Measurements = {};
        for (const [key] of MEASUREMENT_FIELDS) {
          const value = (s as Record<string, unknown>)[key];
          if (typeof value === "number") measurements[key] = value;
        }
        return { name: s.name, was: s.was, measurements: Object.keys(measurements).length ? measurements : null };
      }),
    },
  };
}
