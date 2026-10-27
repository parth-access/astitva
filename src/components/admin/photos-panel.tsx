"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attachPhotoAction, changePhotoAction, signPhotoUploadAction } from "@/app/admin/(panel)/pieces/actions";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import type { PhotoEdit } from "@/lib/photo-edit";
import { ANGLE_LABEL, PHOTO_ANGLES, turnFrames, type PhotoAngle } from "@/lib/photo-turn";
import { PhotoEditor } from "./photo-editor";
import { cardClass, FormError } from "./ui";
import { IMAGE_ACCEPT, uploadToCloudinary } from "./upload";

export type PanelPhoto = {
  id: string;
  url: string;
  originalUrl: string | null;
  edit: PhotoEdit | null;
  altText: string;
  color: string | null;
  /** Which way the piece faces, for the turn on the piece page. */
  angle: PhotoAngle | null;
};
type Colour = { name: string; hex: string | null };
/** Photos of one colour, or of every colour (name null). `gone`: a colour the piece no longer has. */
type Group = { name: string | null; hex: string | null; gone?: boolean; photos: PanelPhoto[] };

/**
 * A piece's photographs, in a section per colour: each colour's own photos
 * show when that colour is chosen on the site (its first is its main photo),
 * and photos of every colour follow them, or stand in until a colour has its
 * own. Upload into a section (straight to Cloudinary) and the photos belong
 * to that colour; the editor then opens for each new photo in turn to crop,
 * turn and mirror it. Describe, reorder, move to another colour, remove.
 * Marking a colour's front, side and back photos lets buyers turn it round on
 * the piece page. The very first photo is the piece's cover.
 */
export function PhotosPanel({
  productId,
  photos,
  pieceLabel,
  colours,
}: {
  productId: string;
  photos: PanelPhoto[];
  pieceLabel: string;
  /** The style's colours, so photos can belong to one. */
  colours: Colour[];
}) {
  const router = useRouter();
  // Which section is uploading (its colour, "" for every colour), and how far along.
  const [uploading, setUploading] = useState<{ into: string; progress: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // New uploads waiting to be edited, first one open; or one existing photo being edited.
  const [queue, setQueue] = useState<{ photos: PanelPhoto[]; total: number } | null>(null);
  const [editing, setEditing] = useState<{ photo: PanelPhoto; label: string } | null>(null);
  const busy = pending || uploading !== null;

  const byColour = colours.length > 1;
  const groups: Group[] = byColour
    ? [
        ...colours.map((c) => ({ ...c, photos: photos.filter((p) => p.color === c.name) })),
        // Photos of a colour since renamed or removed: still on the site for nobody, so shown to be moved or removed.
        ...[...new Set(photos.flatMap((p) => (p.color && !colours.some((c) => c.name === p.color) ? [p.color] : [])))].map((name) => ({
          name,
          hex: null,
          gone: true,
          photos: photos.filter((p) => p.color === name),
        })),
        { name: null, hex: null, photos: photos.filter((p) => p.color === null) },
      ]
    : [{ name: null, hex: null, photos }];

  async function uploadAll(files: File[], colour: string | null) {
    setError(null);
    const problems: string[] = [];
    const added: PanelPhoto[] = [];
    for (const [i, file] of files.entries()) {
      setUploading({ into: colour ?? "", progress: files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…" });
      try {
        const reply = await uploadToCloudinary(file, () => signPhotoUploadAction(productId));
        const saved = await attachPhotoAction(productId, reply, colour);
        if (!saved.ok) throw new Error(saved.error);
        added.push(saved.photo);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name}: upload failed`);
      }
    }
    setUploading(null);
    if (problems.length) setError(problems.join(" "));
    if (added.length) setQueue({ photos: added, total: added.length });
    startTransition(() => router.refresh());
  }

  async function saveEdit(photoId: string, edit: PhotoEdit | null): Promise<string | null> {
    const r = await changePhotoAction(productId, { kind: "edit", photoId, edit });
    if (!r.ok) return r.error;
    router.refresh();
    return null;
  }

  // The next new photo, once this one is saved or kept as it is.
  const next = () => setQueue((q) => (q && q.photos.length > 1 ? { ...q, photos: q.photos.slice(1) } : null));
  const fresh = queue?.photos[0];

  function change(c: Parameters<typeof changePhotoAction>[1]) {
    setError(null);
    startTransition(async () => {
      const r = await changePhotoAction(productId, c);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className={`${cardClass} space-y-5 p-5 sm:p-6`}>
      <div>
        <h2 className="font-display text-xl">Photos</h2>
        <p className="text-sm text-espresso-soft">
          {byColour
            ? "Add photos to each colour: they show when that colour is chosen, and its first photo is its main one. Photos for every colour come after them, or stand in until a colour has its own. Portrait 4:5 suits the arch."
            : "The first is the cover. Portrait 4:5 suits the arch."}
        </p>
      </div>

      <FormError message={error} />

      {fresh ? (
        <PhotoEditor
          key={fresh.id}
          src={fresh.originalUrl ?? fresh.url}
          initial={fresh.edit}
          heading={`${queue!.total > 1 ? `New photo ${queue!.total - queue!.photos.length + 1} of ${queue!.total}` : "Your new photo"}${fresh.color ? `, ${fresh.color}` : ""}`}
          skipLabel={queue!.photos.length > 1 ? "Keep as uploaded, next photo" : "Keep as uploaded"}
          onSave={async (edit) => {
            const problem = await saveEdit(fresh.id, edit);
            if (!problem) next();
            return problem;
          }}
          onSkip={next}
          onClose={() => setQueue(null)}
        />
      ) : editing ? (
        <PhotoEditor
          key={editing.photo.id}
          src={editing.photo.originalUrl ?? editing.photo.url}
          initial={editing.photo.edit}
          heading={`Edit ${editing.label}`}
          skipLabel="Cancel"
          onSave={async (edit) => {
            const problem = await saveEdit(editing.photo.id, edit);
            if (!problem) setEditing(null);
            return problem;
          }}
          onSkip={() => setEditing(null)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {groups.map((g) => {
        const key = g.name ?? "";
        const title = !byColour ? null : g.name ? g.name : "Every colour";
        const here = uploading?.into === key;
        return (
          <div key={key || "every"} className={byColour ? "space-y-3 border-t border-taupe/40 pt-5" : "space-y-3"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {title ? (
                <div className="flex items-center gap-2.5">
                  {g.name ? (
                    <span aria-hidden="true" className="inline-block size-5 rounded-full border border-taupe/60" style={{ backgroundColor: g.hex ?? "#d9c7ad" }} />
                  ) : null}
                  <h3 className="font-medium">{title}</h3>
                  <span className="text-sm text-espresso-soft">
                    {g.photos.length === 0 ? "no photos yet" : g.photos.length === 1 ? "1 photo" : `${g.photos.length} photos`}
                  </span>
                  {g.gone ? <span className="text-xs text-burgundy">no longer a colour of this piece: move or remove these</span> : null}
                  {!g.gone && g.photos.length ? <TurnStatus photos={g.photos} /> : null}
                </div>
              ) : g.photos.length ? (
                <TurnStatus photos={g.photos} />
              ) : (
                <span />
              )}
              {!g.gone ? (
                <label className={`cursor-pointer ${byColour ? "btn-outline min-h-10 px-4" : "btn-primary"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
                  {here ? uploading!.progress : byColour ? (g.name ? `Add photos of ${g.name}` : "Add photos for every colour") : "Add photos"}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = "";
                      if (files.length) void uploadAll(files, g.name);
                    }}
                  />
                </label>
              ) : null}
            </div>

            {g.photos.length === 0 ? (
              <p className="text-sm text-espresso-soft">
                {!byColour
                  ? "No photos yet. Until there are, the site shows a painted sketch of the piece in each colour."
                  : g.name
                    ? `Until ${g.name} has its own, it shows the photos for every colour, or a sketch washed in ${g.name.toLowerCase()}.`
                    : "Optional: photos that suit every colour, like details of the fabric or how it's made."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {g.photos.map((p, i) => {
                  const cover = photos[0]?.id === p.id;
                  const label = `${g.name ? `${g.name} ` : ""}photo ${i + 1}`;
                  return (
                    <li key={p.id} className="space-y-2">
                      <div className="relative aspect-[4/5] overflow-hidden bg-sand">
                        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, already sized by Cloudinary */}
                        <img
                          src={cloudinaryUrl(p.url, { width: 480, height: 600 })}
                          alt={p.altText || `${pieceLabel}, ${label}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {cover ? (
                          <span className="absolute left-2 top-2 bg-ivory px-2 py-0.5 text-xs font-medium">Cover</span>
                        ) : i === 0 && byColour && g.name ? (
                          <span className="absolute left-2 top-2 bg-ivory px-2 py-0.5 text-xs font-medium">Main for {g.name}</span>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditing({ photo: p, label })}
                          className="absolute bottom-2 right-2 bg-ivory/95 px-2.5 py-1 text-xs font-medium shadow-sm hover:bg-ivory"
                          aria-label={`Crop, turn or mirror ${label}`}
                        >
                          {p.edit ? "Edit (edited)" : "Edit"}
                        </button>
                      </div>
                      <label className="block">
                        <span className="sr-only">Describe {label}</span>
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
                      <label className="block">
                        <span className="sr-only">Which way the piece faces in {label}</span>
                        <select
                          value={p.angle ?? ""}
                          disabled={busy}
                          onChange={(e) => change({ kind: "angle", photoId: p.id, angle: (e.target.value || null) as PhotoAngle | null })}
                          className="block w-full border border-taupe bg-ivory px-2 py-1.5 text-sm"
                        >
                          <option value="">Not part of the turn</option>
                          {PHOTO_ANGLES.map((a) => (
                            <option key={a} value={a}>
                              Turn: {ANGLE_LABEL[a].toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      {byColour ? (
                        <label className="block">
                          <span className="sr-only">Which colour {label} shows</span>
                          <select
                            value={p.color ?? ""}
                            disabled={busy}
                            onChange={(e) => change({ kind: "colour", photoId: p.id, colour: e.target.value || null })}
                            className="block w-full border border-taupe bg-ivory px-2 py-1.5 text-sm"
                          >
                            {colours.map((c) => (
                              <option key={c.name} value={c.name}>
                                Photo of {c.name}
                              </option>
                            ))}
                            {g.gone ? <option value={g.name!}>{g.name} (no longer a colour)</option> : null}
                            <option value="">Every colour</option>
                          </select>
                        </label>
                      ) : null}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {i > 0 ? (
                          <>
                            <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "first" })}>
                              {byColour && g.name ? "Make main" : "Make first"}
                            </button>
                            <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "earlier" })} aria-label={`Move ${label} earlier`}>
                              ← Earlier
                            </button>
                          </>
                        ) : null}
                        {i < g.photos.length - 1 ? (
                          <button type="button" className="link" disabled={busy} onClick={() => change({ kind: "move", photoId: p.id, direction: "later" })} aria-label={`Move ${label} later`}>
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
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Whether these photos make a turn on the piece page, and if not, which angles are still to mark. */
function TurnStatus({ photos }: { photos: PanelPhoto[] }) {
  const marked = photos.map((p) => ({ url: p.url, alt: p.altText, angle: p.angle }));
  if (turnFrames(marked)) {
    const mirrored = !photos.some((p) => p.angle === "other_side");
    return <span className="text-xs text-olive">Turns round on the site{mirrored ? " (the side photo, mirrored, stands in for the other side)" : ""}</span>;
  }
  const missing = (["front", "side", "back"] as const).filter((a) => !photos.some((p) => p.angle === a));
  if (missing.length === 3) return null;
  return <span className="text-xs text-espresso-soft">To turn round, mark its {missing.map((a) => ANGLE_LABEL[a].toLowerCase()).join(" and ")}</span>;
}
