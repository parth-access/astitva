import { writeXlsx } from "@/lib/xlsx";
import { parsePieceForm, type PieceInput } from "./input";
import { slugify } from "./fields";

/**
 * Pieces from Krishna's spreadsheet. One row per colour of a piece: the
 * piece's own details are read from its first row, and the next rows of the
 * same piece only need the colour and its sizes. Each piece becomes the same
 * form the piece editor sends, so it is checked by exactly the same rules.
 */

export const COLUMNS = [
  { key: "pieceName", header: "Piece name", width: 22, hint: "The piece's own name, e.g. The Muse Knit. Optional." },
  { key: "name", header: "What it is", width: 30, hint: "Plain words, e.g. Ribbed V-neck knit sweater. Needed." },
  { key: "category", header: "Category", width: 16, hint: "Pick from the list." },
  { key: "price", header: "Price (₹)", width: 11, hint: "e.g. 1499. Same for every colour." },
  { key: "compareAt", header: "Original price (₹)", width: 13, hint: "Only for a sale: the price before. Optional." },
  { key: "colour", header: "Colour", width: 16, hint: "e.g. Sage. One row per colour." },
  { key: "hex", header: "Colour code", width: 12, hint: "For the swatch, like #9caf88. Optional: it can be picked later." },
  { key: "stock", header: "Sizes and stock", width: 24, hint: "Size then how many, e.g. S 2, M 3, L 1. One size: Free size 4." },
  { key: "material", header: "Fabric", width: 22, hint: "e.g. Cotton blend knit. Optional." },
  { key: "fit", header: "Fit", width: 18, hint: "e.g. Relaxed. Optional." },
  { key: "care", header: "Care", width: 22, hint: "e.g. Hand wash cold. Optional." },
  { key: "description", header: "Description", width: 40, hint: "What a buyer reads. Optional." },
  { key: "story", header: "Where it was found", width: 30, hint: "In your words. Optional." },
  { key: "styling", header: "How to wear it", width: 30, hint: "Optional." },
  { key: "cost", header: "Cost (₹, private)", width: 13, hint: "What it cost you. Never shown on the site." },
  { key: "ref", header: "Your reference (private)", width: 18, hint: "Any note or code of yours. Never shown." },
] as const;

type Key = (typeof COLUMNS)[number]["key"];
type Row = { line: number; cells: Record<Key, string> };

/** The template: the sheet to fill, and a sheet that explains it. */
export function templateXlsx(categoryNames: string[]): Buffer {
  const category = COLUMNS.findIndex((c) => c.key === "category");
  return writeXlsx([
    {
      name: "Pieces",
      rows: [COLUMNS.map((c) => c.header)],
      widths: COLUMNS.map((c) => c.width),
      choices: categoryNames.length ? [{ column: category, options: categoryNames }] : [],
    },
    {
      name: "How to fill",
      widths: [24, 70],
      rows: [
        ["Column", "What to write"],
        ...COLUMNS.map((c) => [c.header, c.hint]),
        ["", ""],
        ["A piece in 3 colours", "Three rows. Fill everything on the first; on the next two, the colour, its sizes and stock are enough."],
        ["Example, row 1", "The Muse Knit | Ribbed V-neck knit sweater | Tops | 1499 | | Sage | | S 2, M 3, L 1"],
        ["Example, row 2", "| | | | | Cream | | S 1, M 2"],
        ["Importing", "Upload the file in Pieces → Import from a sheet. You choose which pieces to add; they arrive as drafts. Pieces already on the site are skipped."],
      ],
    },
  ]);
}

/** Lowercase, letters and digits only: "Price (₹)" and "price" both read as "price". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Rows of the sheet by column, found by the header text (so columns may be
 * moved or added). Empty rows are dropped.
 */
export function sheetRows(cells: string[][]): Row[] | string {
  const headerAt = cells.findIndex((r) => r.some((v) => norm(v) === norm("What it is")));
  if (headerAt < 0) return "The sheet needs the template's header row, with a “What it is” column. Download the template and copy your rows into it.";
  const header = cells[headerAt].map(norm);
  const at = Object.fromEntries(COLUMNS.map((c) => [c.key, header.indexOf(norm(c.header))])) as Record<Key, number>;
  // A header shortened in the sheet ("Price") still counts.
  for (const c of COLUMNS) if (at[c.key] < 0) at[c.key] = header.findIndex((h) => h && norm(c.header).startsWith(h));
  return cells.slice(headerAt + 1).flatMap((r, i) => {
    const row = Object.fromEntries(COLUMNS.map((c) => [c.key, at[c.key] >= 0 ? (r[at[c.key]] ?? "").trim() : ""])) as Record<Key, string>;
    return Object.values(row).some(Boolean) ? [{ line: headerAt + i + 2, cells: row }] : [];
  });
}

/** "S 2, M 3, L 1" → sizes and counts; "4" → one unnamed size. A string is what's wrong. */
export function parseStock(text: string): { size: string | null; count: number }[] | string {
  // Sizes are separated by commas, semicolons or new lines (Alt+Enter in Excel).
  const parts = text.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "write each size and how many, like S 2, M 3, L 1.";
  const out: { size: string | null; count: number }[] = [];
  for (const part of parts) {
    // The count is the number at the end; the size is everything before it ("Free size 4", "S:2", "S - 2", "28 3").
    const m = /^(.*?)[\s:=x×-]*(\d+(?:\.\d+)?)$/i.exec(part);
    if (!m) return `“${part}” needs a number after the size, like ${part} 2.`;
    const count = Number(m[2]);
    if (!Number.isInteger(count)) return `“${part}”: stock is whole pieces.`;
    const size = m[1].trim() || null;
    if (size === null && parts.length > 1) return `“${part}” needs its size before the number.`;
    if (size && size.length > 24) return `“${size}” is too long for a size.`;
    if (out.some((o) => (o.size ?? "").toLowerCase() === (size ?? "").toLowerCase())) return `${size ?? "The size"} is listed twice.`;
    out.push({ size, count });
  }
  return out;
}

export type SheetPiece = {
  /** Which piece this is within the sheet: its name, as typed first. */
  key: string;
  title: string;
  lines: number[];
  category: string;
  price: string;
  colours: { name: string; stock: string }[];
  problems: string[];
  /** Ready to save, when there are no problems. */
  input: PieceInput | null;
  slug: string;
};

const FIELD_LABEL: Record<string, string> = {
  name: "What it is",
  pieceName: "Piece name",
  priceMinor: "Price",
  compareAtMinor: "Original price",
  acquisitionCostMinor: "Cost",
  material: "Fabric",
  fit: "Fit",
  careInstructions: "Care",
  internalRef: "Your reference",
  slug: "Piece name",
  stock: "Sizes and stock",
};

function labelOf(field: string) {
  if (field.startsWith("c.")) return "Colour";
  if (field.startsWith("s.") || field.startsWith("stock.")) return "Sizes and stock";
  return FIELD_LABEL[field] ?? "";
}

/**
 * The sheet's rows grouped into pieces, each checked and turned into what
 * the piece editor would save. `categories` maps a lowercased category name
 * or web address to its id.
 */
export function sheetPieces(rows: Row[], categories: Map<string, string>): SheetPiece[] {
  const groups = new Map<string, Row[]>();
  let last: string | null = null;
  for (const row of rows) {
    const own = row.cells.pieceName || row.cells.name;
    const key: string | null = own ? own.toLowerCase() : last;
    if (key === null) {
      groups.set(`line ${row.line}`, [row]);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), row]);
    last = key;
  }

  return [...groups.entries()].map(([key, rows]) => {
    // The piece's details: the first row that has each.
    const first = (k: Key) => rows.find((r) => r.cells[k])?.cells[k] ?? "";
    const problems: string[] = [];
    const title = first("pieceName") || first("name") || `Row ${rows[0].line}`;

    const categoryName = first("category");
    const categoryId = categoryName ? (categories.get(categoryName.toLowerCase()) ?? categories.get(slugify(categoryName)) ?? null) : null;
    if (categoryName && !categoryId) problems.push(`Category “${categoryName}” isn't one of the shop's.`);

    const colourNames = rows.map((r) => r.cells.colour);
    const seenColours = new Set<string>();
    for (const [i, c] of colourNames.entries()) {
      if (seenColours.has(c.toLowerCase())) problems.push(`Row ${rows[i].line}: ${c ? `${c} is listed twice` : "a second row without a colour"}.`);
      seenColours.add(c.toLowerCase());
    }

    const stocks = rows.map((r) => {
      const s = parseStock(r.cells.stock);
      if (typeof s === "string") problems.push(`Row ${r.line}, sizes and stock: ${s}`);
      return typeof s === "string" ? [] : s;
    });
    // Every size of the piece, in the order first met; each colour has stock in some of them.
    const sizes: (string | null)[] = [];
    for (const s of stocks.flat()) if (!sizes.some((x) => (x ?? "").toLowerCase() === (s.size ?? "").toLowerCase())) sizes.push(s.size);

    const form = new FormData();
    const put = (k: string, v: string) => form.set(k, v);
    put("pieceName", first("pieceName"));
    put("name", first("name"));
    put("slug", "");
    put("categoryId", categoryId ?? "");
    put("priceMinor", first("price"));
    put("compareAtMinor", first("compareAt"));
    put("material", first("material"));
    put("fit", first("fit"));
    put("careInstructions", first("care"));
    put("description", first("description"));
    put("story", first("story"));
    put("stylingNote", first("styling"));
    put("acquisitionCostMinor", first("cost"));
    put("internalRef", first("ref"));
    rows.forEach((r, i) => {
      put(`c.${i}.name`, r.cells.colour);
      put(`c.${i}.hex`, r.cells.hex);
    });
    sizes.forEach((size, j) => {
      put(`s.${j}.name`, size ?? "");
      rows.forEach((_, i) => {
        const n = stocks[i].find((s) => (s.size ?? "").toLowerCase() === (size ?? "").toLowerCase());
        put(`stock.${i}.${j}`, n ? String(n.count) : "");
      });
    });

    let input: PieceInput | null = null;
    if (!problems.length) {
      const parsed = parsePieceForm(form);
      if (parsed.ok) input = parsed.data;
      else {
        const seen = new Set<string>();
        for (const [field, message] of Object.entries(parsed.errors)) {
          const label = labelOf(field);
          const text = label && !message.startsWith(label) ? `${label}: ${message}` : message;
          if (!seen.has(text)) problems.push(text);
          seen.add(text);
        }
      }
    }

    return {
      key,
      title,
      lines: rows.map((r) => r.line),
      category: categoryName,
      price: first("price"),
      colours: rows.map((r) => ({ name: r.cells.colour, stock: r.cells.stock })),
      problems,
      input,
      slug: input?.slug ?? slugify(first("pieceName"), first("name")),
    };
  });
}
