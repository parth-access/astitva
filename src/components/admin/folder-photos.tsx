"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { photoFolderPiecesAction, type FolderPiece } from "@/app/admin/(panel)/pieces/import/actions";
import { folderName, placePhotos } from "@/lib/photo-folders";
import { cardClass, Chip, FormError, Notice } from "./ui";
import { uploadPhotoGroups } from "./upload-photos";

type Section = { colour: string | null; folder: string | null; files: File[] };
type Plan = { piece: FolderPiece; sections: Section[]; unknown: string[]; existing: number };

/** A colour folder's colour on the piece: by name, ignoring case and the characters a folder can't hold. */
function colourOf(piece: FolderPiece, folder: string | null): string | null | undefined {
  if (folder === null) return null;
  const f = folder.trim().toLowerCase();
  return piece.colours.find((c) => c.toLowerCase() === f || folderName(null, c).toLowerCase() === f);
}

/**
 * Photos for many pieces at once, from a folder laid out like the one the
 * sheet import downloads: a folder per piece named by its number, a folder
 * per colour inside it. Shows where every photo will go before sending any.
 */
export function FolderPhotos() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; added: number; problems: string[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = pending || progress !== null;

  function choose(list: File[]) {
    setError(null);
    setDone(null);
    const { placed, stray } = placePhotos(list.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
    if (!placed.length) {
      setPlans(null);
      setError("No photos found in piece folders. Each piece's folder name must start with its number, like “13 The Muse Knit”.");
      return;
    }
    start(async () => {
      const numbers = [...new Set(placed.map((p) => p.piece))];
      const pieces = await photoFolderPiecesAction(numbers);
      const next: Plan[] = [];
      const missing = numbers.filter((n) => !pieces.some((p) => p.number === n));
      for (const piece of pieces) {
        const mine = placed.filter((p) => p.piece === piece.number);
        const byFolder = new Map<string | null, File[]>();
        for (const p of mine) byFolder.set(p.colour, [...(byFolder.get(p.colour) ?? []), p.file]);
        const sections: Section[] = [];
        const unknown: string[] = [];
        for (const [folder, files] of byFolder) {
          const colour = colourOf(piece, folder);
          if (colour === undefined) unknown.push(`${folder} (${files.length})`);
          else sections.push({ colour, folder, files });
        }
        next.push({ piece, sections, unknown, existing: Object.values(piece.photos).reduce((a, b) => a + b, 0) });
      }
      next.sort((a, b) => a.piece.number - b.piece.number);
      setPlans(next);
      setChosen(new Set(next.filter((p) => p.existing === 0 && p.sections.length).map((p) => p.piece.id)));
      setNotes([
        ...missing.map((n) => `No piece is numbered ${n}: its folder is left out.`),
        ...(stray.length ? [`${stray.length} ${stray.length === 1 ? "file isn't" : "files aren't"} a photo in a piece's folder, and will be left out.`] : []),
      ]);
    });
  }

  async function send() {
    if (!plans) return;
    const todo = plans.filter((p) => chosen.has(p.piece.id));
    // Every photo of every chosen piece through one set of uploads, then one save.
    const groups = todo.flatMap((plan) => plan.sections.map((s) => ({ plan, group: { productId: plan.piece.id, colour: s.colour, files: s.files } })));
    const results = await uploadPhotoGroups(
      groups.map((g) => g.group),
      setProgress,
    );
    const report: NonNullable<typeof done> = todo.map((plan) => {
      const mine = results.filter((_, i) => groups[i]!.plan === plan);
      return { title: `Nº ${plan.piece.number} ${plan.piece.title}`, added: mine.reduce((n, r) => n + r.added.length, 0), problems: mine.flatMap((r) => r.problems) };
    });
    setProgress(null);
    setPlans(null);
    setDone(report);
  }

  const count = plans?.filter((p) => chosen.has(p.piece.id)).reduce((n, p) => n + p.sections.reduce((m, s) => m + s.files.length, 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-4 p-5 sm:p-6`}>
        <p className="text-sm text-espresso-soft">
          Choose the folder that holds the pieces&apos; folders (“Astitva photos” if you downloaded them from the import). Inside each piece&apos;s folder, a
          folder per colour; photos straight in the piece&apos;s folder are for every colour. Photos go in name order, so the first is the main one.
        </p>
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {pending ? "Reading…" : plans ? "Choose another folder" : "Choose the photos folder"}
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            {...{ webkitdirectory: "" }}
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = "";
              if (list.length) choose(list);
            }}
          />
        </label>
        <FormError message={error} />
        {notes.map((n) => (
          <p key={n} className="text-sm text-espresso-soft">
            {n}
          </p>
        ))}
      </section>

      {plans ? (
        <section className={`${cardClass} space-y-4 p-5 sm:p-6`}>
          <ul className="divide-y divide-sand/80 border-y border-sand/80">
            {plans.map(({ piece, sections, unknown, existing }) => (
              <li key={piece.id} className="py-3">
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-burgundy"
                    disabled={busy || !sections.length}
                    checked={chosen.has(piece.id)}
                    onChange={(e) =>
                      setChosen((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(piece.id);
                        else next.delete(piece.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        Nº {piece.number} {piece.title}
                      </span>
                      {existing ? <Chip tone="warning">Has {existing} photos already</Chip> : null}
                    </span>
                    <span className="block text-sm text-espresso-soft">
                      {sections.map((s) => `${s.colour ?? "Every colour"}: ${s.files.length}`).join(" · ") || "No photos it can take"}
                    </span>
                    {existing ? <span className="block text-sm text-espresso-soft">Ticked, these are added after the ones it has.</span> : null}
                    {unknown.length ? (
                      <span className="block text-sm text-burgundy">
                        Not colours of this piece, left out: {unknown.join(", ")}. Its colours are {piece.colours.join(", ") || "not named"}.
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary" disabled={busy || count === 0} onClick={() => void send()}>
            {progress ?? `Add ${count} ${count === 1 ? "photo" : "photos"}`}
          </button>
          {progress ? <p className="text-sm text-espresso-soft">Keep this page open until it finishes.</p> : null}
        </section>
      ) : null}

      {done ? (
        <section className={`${cardClass} space-y-3 p-5 sm:p-6`}>
          <Notice>
            Added {done.reduce((n, d) => n + d.added, 0)} photos to {done.filter((d) => d.added).length} pieces.
          </Notice>
          {done.flatMap((d) => (d.problems.length ? [<FormError key={d.title} message={`${d.title}: ${d.problems.join(" ")}`} />] : []))}
          <p className="text-sm text-espresso-soft">
            Open a piece to crop a photo, mark which are front, side and back, or describe them. <Link href="/admin/pieces" className="link">Back to the pieces</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
