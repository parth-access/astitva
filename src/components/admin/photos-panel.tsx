"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { attachPhotoAction, changePhotoAction, signPhotoUploadAction } from "@/app/admin/(panel)/pieces/actions";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { FormError } from "./ui";

export type PanelPhoto = { id: string; url: string; altText: string };

/** Cloudinary's free plan accepts images up to 10 MB. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A piece's photographs: upload (straight to Cloudinary), describe, reorder,
 * remove. The first photo is the cover in the piece's arch.
 */
export function PhotosPanel({ productId, photos, pieceLabel }: { productId: string; photos: PanelPhoto[]; pieceLabel: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = pending || progress !== null;

  async function uploadAll(files: File[]) {
    setError(null);
    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
      if (file.size > MAX_BYTES) {
        problems.push(`${file.name} is over 10 MB. Export a smaller copy and try again.`);
        continue;
      }
      try {
        const { url, fields } = await signPhotoUploadAction(productId);
        const body = new FormData();
        for (const [k, v] of Object.entries(fields)) body.append(k, v);
        body.append("file", file);
        const res = await fetch(url, { method: "POST", body });
        const reply = await res.json();
        if (!res.ok) throw new Error(reply?.error?.message ?? `Upload failed (${res.status}).`);
        const saved = await attachPhotoAction(productId, reply);
        if (!saved.ok) throw new Error(saved.error);
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }
    setProgress(null);
    if (problems.length) setError(problems.join(" "));
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  function change(c: Parameters<typeof changePhotoAction>[1]) {
    setError(null);
    startTransition(async () => {
      const r = await changePhotoAction(productId, c);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 border border-sand p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Photos</h2>
          <p className="text-sm text-espresso-soft">The first one is the cover. Shot 4:5 (portrait) looks best in the arch.</p>
        </div>
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {progress ?? "Add photos"}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) void uploadAll(files);
            }}
          />
        </label>
      </div>

      <FormError message={error} />

      {photos.length === 0 ? (
        <p className="text-sm text-espresso-soft">
          No photos yet. Until there are, the site shows the piece in its tone with its number and name.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-2">
              <div className="relative aspect-[4/5] overflow-hidden bg-sand">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, already sized by Cloudinary */}
                <img
                  src={cloudinaryUrl(p.url, { width: 480, height: 600 })}
                  alt={p.altText || `${pieceLabel}, photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {i === 0 ? <span className="absolute left-2 top-2 bg-ivory px-2 py-0.5 text-xs font-medium">Cover</span> : null}
              </div>
              <label className="block">
                <span className="sr-only">Describe photo {i + 1}</span>
                <input
                  defaultValue={p.altText}
                  placeholder="Describe it, e.g. worn with a belt"
                  maxLength={240}
                  className="block w-full border border-taupe bg-ivory px-2 py-1.5 text-sm"
                  onBlur={(e) => {
                    if (e.target.value.trim() !== p.altText) change({ kind: "alt", photoId: p.id, altText: e.target.value });
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {i > 0 ? (
                  <>
                    <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "first" })}>
                      Make cover
                    </button>
                    <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "earlier" })} aria-label={`Move photo ${i + 1} earlier`}>
                      ← Earlier
                    </button>
                  </>
                ) : null}
                {i < photos.length - 1 ? (
                  <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "later" })} aria-label={`Move photo ${i + 1} later`}>
                    Later →
                  </button>
                ) : null}
                <button
                  type="button"
                  className="link text-burgundy"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Remove this photo? It will be deleted.")) change({ kind: "remove", photoId: p.id });
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
