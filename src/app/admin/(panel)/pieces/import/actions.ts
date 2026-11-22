"use server";

import { updateTag } from "next/cache";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { categories, productImages, products, productVariants } from "@/db/schema";
import { readXlsx } from "@/lib/xlsx";
import { writeZip } from "@/lib/zip";
import { requireAdmin } from "@/modules/auth/auth";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { PieceRuleError, nextPieceNumber, savePiece } from "@/modules/catalog-admin/service";
import { sheetPieces, sheetRows, templateXlsx, type SheetPiece } from "@/modules/catalog-admin/sheet";
import { folderName } from "@/lib/photo-folders";

const MAX_SHEET_BYTES = 900 * 1024;

/** The template to fill, as base64 for the browser to save. */
export async function templateAction(): Promise<string> {
  await requireAdmin();
  const list = await db.select({ name: categories.name }).from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
  return templateXlsx(list.map((c) => c.name)).toString("base64");
}

export type PreviewPiece = Omit<SheetPiece, "input"> & {
  input?: undefined;
  /** The piece already on the site with this name or address, if any: it is skipped. */
  existing: string | null;
};
export type Preview = { ok: true; pieces: PreviewPiece[] } | { ok: false; error: string };

async function readSheet(form: FormData): Promise<{ ok: true; pieces: (SheetPiece & { existing: string | null })[] } | { ok: false; error: string }> {
  const file = form.get("sheet");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the spreadsheet first." };
  if (file.size > MAX_SHEET_BYTES) return { ok: false, error: "That file is over 900 KB. Remove any pictures from the sheet and try again." };

  let cells: string[][];
  try {
    cells = readXlsx(Buffer.from(await file.arrayBuffer()), "Pieces");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That file couldn't be read." };
  }
  const rows = sheetRows(cells);
  if (typeof rows === "string") return { ok: false, error: rows };
  if (rows.length === 0) return { ok: false, error: "The sheet has no pieces under its header row." };

  const list = await db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories);
  const byName = new Map<string, string>();
  for (const c of list) {
    byName.set(c.name.toLowerCase(), c.id);
    byName.set(c.slug, c.id);
  }
  const pieces = sheetPieces(rows, byName);

  // Already on the site: the same web address, or the same piece name.
  const slugs = pieces.map((p) => p.slug).filter(Boolean);
  const names = pieces.map((p) => p.input?.pieceName?.toLowerCase()).filter((n): n is string => !!n);
  const found = slugs.length || names.length
    ? await db
        .select({ slug: products.slug, pieceName: products.pieceName, name: products.name, number: products.pieceNumber })
        .from(products)
        .where(or(slugs.length ? inArray(products.slug, slugs) : undefined, names.length ? inArray(sql`lower(${products.pieceName})`, names) : undefined))
    : [];
  return {
    ok: true,
    pieces: pieces.map((p) => {
      const hit = found.find((f) => f.slug === p.slug || (p.input?.pieceName && f.pieceName?.toLowerCase() === p.input.pieceName.toLowerCase()));
      return { ...p, existing: hit ? `${hit.number ? `Nº ${hit.number} ` : ""}${hit.pieceName ?? hit.name}` : null };
    }),
  };
}

/** What the sheet holds, checked, for Krishna to choose from. Nothing is saved. */
export async function previewSheetAction(form: FormData): Promise<Preview> {
  await requireAdmin();
  const read = await readSheet(form);
  if (!read.ok) return read;
  // The parsed form stays on the server; the browser only shows the piece.
  return { ok: true, pieces: read.pieces.map((p) => ({ ...p, input: undefined })) };
}

export type Imported = { key: string; title: string; ok: true; id: string; number: number } | { key: string; title: string; ok: false; error: string };

/**
 * Adds the chosen pieces as drafts. The sheet is read again here rather than
 * trusting what the browser shows; pieces already on the site, or with
 * problems, are never added.
 */
export async function importSheetAction(form: FormData): Promise<{ ok: true; results: Imported[] } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const keys = z.array(z.string().max(200)).max(500).safeParse(form.getAll("key"));
  if (!keys.success || keys.data.length === 0) return { ok: false, error: "Choose at least one piece." };
  const read = await readSheet(form);
  if (!read.ok) return read;

  const results: Imported[] = [];
  for (const key of keys.data) {
    const p = read.pieces.find((x) => x.key === key);
    if (!p) continue;
    if (p.existing) {
      results.push({ key, title: p.title, ok: false, error: `Already on the site as ${p.existing}.` });
      continue;
    }
    if (!p.input) {
      results.push({ key, title: p.title, ok: false, error: p.problems.join(" ") });
      continue;
    }
    try {
      const number = await nextPieceNumber(db);
      const id = await savePiece(db, { ...p.input, pieceNumber: number }, { actorId: user.id });
      results.push({ key, title: p.title, ok: true, id, number });
    } catch (err) {
      const error = err instanceof PieceRuleError ? err.message : "It couldn't be saved. Try again, or add it by hand.";
      if (!(err instanceof PieceRuleError)) console.error("Sheet import failed", err);
      results.push({ key, title: p.title, ok: false, error });
    }
  }
  if (results.some((r) => r.ok)) updateTag(CATALOG_TAG);
  return { ok: true, results };
}

/** The pieces' colours, as the site has them, for photo folders. */
async function folderPieces(ids: string[]) {
  const rows = await db
    .select({ id: products.id, number: products.pieceNumber, pieceName: products.pieceName, name: products.name, color: productVariants.color })
    .from(products)
    .leftJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
    .where(inArray(products.id, ids))
    .orderBy(asc(products.pieceNumber), asc(productVariants.createdAt));
  const out = new Map<string, { id: string; number: number | null; title: string; colours: string[] }>();
  for (const r of rows) {
    const p = out.get(r.id) ?? { id: r.id, number: r.number, title: r.pieceName ?? r.name, colours: [] };
    if (r.color && !p.colours.includes(r.color)) p.colours.push(r.color);
    out.set(r.id, p);
  }
  return [...out.values()];
}

/**
 * Empty folders to put photos in: one per piece, named by its number, and
 * one inside it per colour. As base64 (a zip) for the browser to save.
 */
export async function photoFoldersAction(ids: string[]): Promise<string> {
  await requireAdmin();
  const valid = z.array(z.uuid()).max(500).parse(ids);
  const pieces = await folderPieces(valid);
  const top = "Astitva photos";
  return writeZip([
    { name: `${top}/` },
    ...pieces.flatMap((p) => {
      const folder = `${top}/${folderName(p.number, p.title)}/`;
      return [{ name: folder }, ...p.colours.map((c) => ({ name: `${folder}${folderName(null, c)}/` }))];
    }),
  ]).toString("base64");
}

export type FolderPiece = { number: number; id: string; title: string; colours: string[]; photos: Record<string, number> };

/** The pieces with these numbers, their colours and how many photos each colour has (key "" for every colour). */
export async function photoFolderPiecesAction(numbers: number[]): Promise<FolderPiece[]> {
  await requireAdmin();
  const valid = z.array(z.number().int().positive()).max(500).parse(numbers);
  if (!valid.length) return [];
  const found = await db.select({ id: products.id }).from(products).where(inArray(products.pieceNumber, valid));
  if (!found.length) return [];
  const [pieces, counts] = await Promise.all([
    folderPieces(found.map((f) => f.id)),
    db
      .select({ productId: productImages.productId, color: productImages.color, n: sql<number>`count(*)::int` })
      .from(productImages)
      .where(inArray(productImages.productId, found.map((f) => f.id)))
      .groupBy(productImages.productId, productImages.color),
  ]);
  return pieces.map((p) => ({
    number: p.number!,
    id: p.id,
    title: p.title,
    colours: p.colours,
    photos: Object.fromEntries(counts.filter((c) => c.productId === p.id).map((c) => [c.color ?? "", c.n])),
  }));
}
