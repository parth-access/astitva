"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  importSheetAction,
  photoFoldersAction,
  previewSheetAction,
  templateAction,
  type Imported,
  type PreviewPiece,
} from "@/app/admin/(panel)/pieces/import/actions";
import { cardClass, Chip, FormError, Notice } from "./ui";
import { saveBase64, XLSX_TYPE } from "./save-file";

/**
 * Pieces from a spreadsheet: download the template, upload the filled file,
 * see every piece it holds with anything wrong, tick the ones to add, and add
 * them as drafts. Then download empty photo folders for them.
 */
export function SheetImport() {
  const [file, setFile] = useState<File | null>(null);
  const [pieces, setPieces] = useState<PreviewPiece[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Imported[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = (p: PreviewPiece) => !p.existing && p.problems.length === 0;

  function read(f: File) {
    setFile(f);
    setError(null);
    setResults(null);
    start(async () => {
      const form = new FormData();
      form.set("sheet", f);
      const r = await previewSheetAction(form);
      if (!r.ok) {
        setPieces(null);
        setError(r.error);
        return;
      }
      setPieces(r.pieces);
      setChosen(new Set(r.pieces.filter(ready).map((p) => p.key)));
    });
  }

  function add() {
    if (!file) return;
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("sheet", file);
      for (const key of chosen) form.append("key", key);
      const r = await importSheetAction(form);
      if (!r.ok) setError(r.error);
      else {
        setResults(r.results);
        setPieces(null);
      }
    });
  }

  function toggle(key: string, on: boolean) {
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const added = results?.filter((r): r is Extract<Imported, { ok: true }> => r.ok) ?? [];
  const failed = results?.filter((r): r is Extract<Imported, { ok: false }> => !r.ok) ?? [];
  const readyCount = pieces?.filter(ready).length ?? 0;

  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-3 p-5 sm:p-6`}>
        <h2 className="font-display text-xl">1. Fill in the template</h2>
        <p className="text-sm text-espresso-soft">
          One row per colour of a piece. Fill the piece&apos;s details on its first row; for its other colours, the colour, sizes and stock are enough. The
          second sheet in the file explains each column.
        </p>
        <button
          type="button"
          className="btn-outline"
          disabled={pending}
          onClick={() => start(async () => saveBase64(await templateAction(), "Astitva pieces.xlsx", XLSX_TYPE))}
        >
          Download the template
        </button>
      </section>

      <section className={`${cardClass} space-y-4 p-5 sm:p-6`}>
        <h2 className="font-display text-xl">2. Upload it and choose the pieces</h2>
        <p className="text-sm text-espresso-soft">Nothing is added yet: you&apos;ll see every piece in the sheet first. From Google Sheets, use File → Download → Excel (.xlsx).</p>
        <label className={`btn-primary cursor-pointer ${pending ? "pointer-events-none opacity-60" : ""}`}>
          {pending && !pieces ? "Reading…" : file ? "Choose another file" : "Choose the spreadsheet"}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) read(f);
            }}
          />
        </label>
        {file ? <p className="text-sm text-espresso-soft">{file.name}</p> : null}
        <FormError message={error} />

        {pieces ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>
                {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} in the sheet, {readyCount} ready to add.
              </span>
              <button type="button" className="link" onClick={() => setChosen(new Set(pieces.filter(ready).map((p) => p.key)))}>
                Choose all ready
              </button>
              <button type="button" className="link" onClick={() => setChosen(new Set())}>
                Choose none
              </button>
            </div>
            <ul className="divide-y divide-sand/80 border-y border-sand/80">
              {pieces.map((p) => {
                const can = ready(p);
                return (
                  <li key={p.key} className="py-3">
                    <label className={`flex gap-3 ${can ? "cursor-pointer" : "opacity-80"}`}>
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-burgundy"
                        disabled={!can || pending}
                        checked={can && chosen.has(p.key)}
                        onChange={(e) => toggle(p.key, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.title}</span>
                          {p.existing ? <Chip tone="quiet">Already on the site</Chip> : p.problems.length ? <Chip tone="attention">Needs fixing</Chip> : null}
                          <span className="text-xs text-espresso-soft">
                            {p.lines.length === 1 ? `row ${p.lines[0]}` : `rows ${p.lines[0]}–${p.lines[p.lines.length - 1]}`}
                          </span>
                        </span>
                        <span className="block text-sm text-espresso-soft">
                          {[p.category, p.price ? `₹${p.price}` : null, p.colours.map((c) => [c.name, c.stock].filter(Boolean).join(": ")).join(" · ")]
                            .filter(Boolean)
                            .join(" — ")}
                        </span>
                        {p.existing ? <span className="block text-sm text-espresso-soft">Skipped: {p.existing} has this name.</span> : null}
                        {!p.existing && p.problems.length ? (
                          <ul className="list-disc space-y-0.5 pl-5 text-sm text-burgundy">
                            {p.problems.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-espresso-soft">Fix a piece in the sheet and upload it again to add it. Pieces are added as drafts, numbered after the last one.</p>
            <button type="button" className="btn-primary" disabled={pending || chosen.size === 0} onClick={add}>
              {pending ? "Adding…" : `Add ${chosen.size} ${chosen.size === 1 ? "piece" : "pieces"} as drafts`}
            </button>
          </div>
        ) : null}
      </section>

      {results ? (
        <section className={`${cardClass} space-y-4 p-5 sm:p-6`}>
          <h2 className="font-display text-xl">3. Photos</h2>
          {added.length ? (
            <Notice>
              Added {added.length} {added.length === 1 ? "draft" : "drafts"}: {added.map((a) => `Nº ${a.number} ${a.title}`).join(", ")}.
            </Notice>
          ) : null}
          {failed.length ? (
            <FormError message={`Not added: ${failed.map((f) => `${f.title} (${f.error})`).join("; ")}`} />
          ) : null}
          {added.length ? (
            <>
              <p className="text-sm text-espresso-soft">
                Download a folder for each new piece, with a folder inside for each colour. Put each colour&apos;s photos in its folder (photos for every colour
                straight in the piece&apos;s folder), in the order they should show, then add them all at once.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={pending}
                  onClick={() => start(async () => saveBase64(await photoFoldersAction(added.map((a) => a.id)), "Astitva photos.zip", "application/zip"))}
                >
                  Download the photo folders
                </button>
                <Link href="/admin/pieces/photos" className="btn-primary">
                  Add photos from folders
                </Link>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
