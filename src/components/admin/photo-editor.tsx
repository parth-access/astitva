"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { fullCrop, PHOTO_RATIO, turnedSize, type PhotoEdit } from "@/lib/photo-edit";
import { FormError } from "./ui";

/**
 * Crop, move, resize, turn and mirror one photo before it shows on the site.
 * The whole photo is shown with a 4:5 frame (the arch) over it: drag the
 * frame to move it, pull a corner or use the slider to resize it. Arrow keys
 * move a focused frame, + and − resize it. Nothing changes the uploaded file:
 * the edit is saved and Cloudinary applies it (lib/photo-edit.ts).
 */

type Crop = PhotoEdit["crop"];
type Corner = "nw" | "ne" | "sw" | "se";
type Drag = { mode: "move" | Corner; x: number; y: number; start: Crop; box: DOMRect };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const same = (a: PhotoEdit, b: PhotoEdit | null) => !!b && a.rotate === b.rotate && a.flip === b.flip && JSON.stringify(a.crop) === JSON.stringify(b.crop);

export function PhotoEditor({
  src,
  initial,
  heading,
  skipLabel,
  onSave,
  onSkip,
  onClose,
}: {
  /** The untouched original. */
  src: string;
  initial: PhotoEdit | null;
  heading: string;
  /** Leave without saving, e.g. "Keep as uploaded" for a new photo. */
  skipLabel: string;
  /** Resolves with an error message, or null once saved. */
  onSave: (edit: PhotoEdit | null) => Promise<string | null>;
  onSkip: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [rotate, setRotate] = useState<PhotoEdit["rotate"]>(initial?.rotate ?? 0);
  const [flip, setFlip] = useState(initial?.flip ?? false);
  const [crop, setCrop] = useState<Crop | null>(initial?.crop ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // A large copy is plenty to edit with; the crop is in fractions, so it applies to the original exactly.
  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setFailed(true);
    image.src = cloudinaryUrl(src, { width: 1600 });
  }, [src]);

  const size = img ? turnedSize(img.naturalWidth, img.naturalHeight, rotate) : null;
  // Height of the crop as a fraction, for a width fraction: keeps the frame 4:5 on the photo itself.
  const k = size ? size.width / (PHOTO_RATIO * size.height) : 1;
  const full = size ? fullCrop(size.width, size.height) : null;
  const shown = crop ?? full;

  // The photo, flipped then turned, as Cloudinary will do it.
  useEffect(() => {
    const c = canvas.current;
    if (!img || !c || !size) return;
    c.width = size.width;
    c.height = size.height;
    const ctx = c.getContext("2d")!;
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  }, [img, rotate, flip, size?.width, size?.height]); // eslint-disable-line react-hooks/exhaustive-deps -- size is derived from img and rotate

  // The arch, as it will look on the site.
  useEffect(() => {
    const c = canvas.current;
    const p = preview.current;
    if (!c || !p || !shown || !size) return;
    p.width = 320;
    p.height = 400;
    p.getContext("2d")!.drawImage(c, shown.x * size.width, shown.y * size.height, shown.width * size.width, shown.height * size.height, 0, 0, 320, 400);
  }, [shown, size, img, rotate, flip]);

  function turn(by: 90 | -90) {
    setRotate((r) => (((r + by + 360) % 360) as PhotoEdit["rotate"]));
    setCrop(null);
  }

  function resizeTo(width: number) {
    if (!shown || !full) return;
    const w = clamp(width, full.width * 0.15, full.width);
    const h = w * k;
    const cx = shown.x + shown.width / 2;
    const cy = shown.y + shown.height / 2;
    setCrop({ x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), width: w, height: h });
  }

  function start(mode: Drag["mode"], e: PointerEvent<HTMLElement>) {
    if (!shown) return;
    e.preventDefault();
    e.stopPropagation();
    // preventDefault also stops the frame taking focus; give it focus so the keys work next.
    e.currentTarget.closest<HTMLElement>('[role="slider"]')?.focus({ preventScroll: true });
    const box = e.currentTarget.closest("[data-stage]")!.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: shown, box };
  }

  function move(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || !full) return;
    const dx = (e.clientX - d.x) / d.box.width;
    const dy = (e.clientY - d.y) / d.box.height;
    const s = d.start;
    if (d.mode === "move") {
      setCrop({ ...s, x: clamp(s.x + dx, 0, 1 - s.width), y: clamp(s.y + dy, 0, 1 - s.height) });
      return;
    }
    // Resize from a corner; the opposite corner stays put.
    const right = d.mode === "ne" || d.mode === "se";
    const down = d.mode === "sw" || d.mode === "se";
    const ax = right ? s.x : s.x + s.width;
    const ay = down ? s.y : s.y + s.height;
    const byX = s.width + (right ? dx : -dx);
    const byY = (s.height + (down ? dy : -dy)) / k;
    // Follow whichever way the pointer moved more.
    const wanted = Math.abs(byX - s.width) >= Math.abs(byY - s.width) ? byX : byY;
    const room = Math.min(right ? 1 - ax : ax, (down ? 1 - ay : ay) / k);
    const w = clamp(wanted, full.width * 0.15, room);
    const h = w * k;
    setCrop({ x: right ? ax : ax - w, y: down ? ay : ay - h, width: w, height: h });
  }

  function end() {
    drag.current = null;
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!shown || !full) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key]!;
      setCrop({ ...shown, x: clamp(shown.x + mx, 0, 1 - shown.width), y: clamp(shown.y + my, 0, 1 - shown.height) });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      resizeTo(shown.width + full.width * 0.05);
    } else if (e.key === "-") {
      e.preventDefault();
      resizeTo(shown.width - full.width * 0.05);
    }
  }

  async function save(edit: PhotoEdit | null) {
    setSaving(true);
    setError(null);
    const problem = await onSave(edit);
    setSaving(false);
    if (problem) setError(problem);
  }

  const current: PhotoEdit | null = shown ? { rotate, flip, crop: shown } : null;
  const unchanged = current ? same(current, initial) : true;
  const corners: Corner[] = ["nw", "ne", "sw", "se"];

  return (
    <dialog
      ref={dialog}
      aria-label={heading}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      className="m-auto max-h-[96dvh] w-[min(68rem,96vw)] overflow-y-auto bg-ivory p-0 text-espresso backdrop:bg-espresso/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-taupe/40 px-5 py-4">
        <h2 className="font-display text-xl">{heading}</h2>
        <button type="button" className="link text-sm" onClick={onClose} disabled={saving}>
          Close
        </button>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[1fr_15rem]">
        <div>
          {failed ? (
            <p className="py-16 text-center text-sm text-burgundy">This photo couldn&apos;t be loaded. Close and try again.</p>
          ) : !size || !shown ? (
            <div className="skeleton mx-auto aspect-[4/5] w-full max-w-sm" aria-label="Loading the photo" />
          ) : (
            <div
              data-stage
              className="relative mx-auto touch-none select-none overflow-hidden bg-sand"
              style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100%, calc(62dvh * ${size.width / size.height}))` }}
            >
              <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
              <div
                role="slider"
                tabIndex={0}
                aria-label="Crop frame. Arrow keys move it; plus and minus resize it."
                aria-valuemin={15}
                aria-valuemax={100}
                aria-valuenow={Math.round((shown.width / full!.width) * 100)}
                onKeyDown={onKey}
                onPointerDown={(e) => start("move", e)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                className="absolute cursor-move outline outline-2 outline-ivory focus-visible:outline-burgundy"
                style={{
                  left: `${shown.x * 100}%`,
                  top: `${shown.y * 100}%`,
                  width: `${shown.width * 100}%`,
                  height: `${shown.height * 100}%`,
                  boxShadow: "0 0 0 9999px rgb(52 37 30 / 0.55)",
                }}
              >
                {/* Thirds, to line things up. */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33.2%,rgb(255_255_255/0.45)_33.3%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.45)_66.6%,transparent_66.8%),linear-gradient(to_bottom,transparent_33.2%,rgb(255_255_255/0.45)_33.3%,transparent_33.5%,transparent_66.5%,rgb(255_255_255/0.45)_66.6%,transparent_66.8%)]" />
                {corners.map((c) => (
                  <span
                    key={c}
                    aria-hidden="true"
                    onPointerDown={(e) => start(c, e)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    className={`absolute size-5 border-2 border-ivory bg-burgundy ${c[0] === "n" ? "-top-2.5" : "-bottom-2.5"} ${c[1] === "w" ? "-left-2.5" : "-right-2.5"} ${
                      c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-center text-xs text-espresso-soft">Drag the frame to move it. Pull a corner to resize it.</p>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium">As it will look</p>
            <div className="arch mt-2 w-28 overflow-hidden bg-sand md:w-40" style={{ aspectRatio: "4/5" }}>
              <canvas ref={preview} className="h-full w-full" />
            </div>
          </div>

          <label className="block text-sm">
            <span className="font-medium">Size</span>
            <input
              type="range"
              min={15}
              max={100}
              value={shown && full ? Math.round((shown.width / full.width) * 100) : 100}
              disabled={!shown}
              onChange={(e) => full && resizeTo((Number(e.target.value) / 100) * full.width)}
              className="mt-2 block w-full accent-burgundy"
            />
            <span className="mt-1 flex justify-between text-xs text-espresso-soft">
              <span>Closer</span>
              <span>Whole photo</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <button type="button" className="btn-outline min-h-10 px-3" disabled={!size} onClick={() => turn(-90)}>
              ↺ Turn left
            </button>
            <button type="button" className="btn-outline min-h-10 px-3" disabled={!size} onClick={() => turn(90)}>
              Turn right ↻
            </button>
            <button
              type="button"
              className="btn-outline min-h-10 px-3"
              disabled={!size}
              onClick={() => {
                // Mirror what's on screen: the flip comes before the turn, so a turned photo also turns back the other way.
                setFlip((f) => !f);
                setRotate((r) => ((360 - r) % 360) as PhotoEdit["rotate"]);
                // The frame moves with the picture, so it still frames the same part.
                if (shown) setCrop({ ...shown, x: 1 - shown.x - shown.width });
              }}
            >
              ⇋ Mirror
            </button>
            <button
              type="button"
              className="btn-outline min-h-10 px-3"
              disabled={!size}
              onClick={() => {
                setRotate(0);
                setFlip(false);
                setCrop(null);
              }}
            >
              Reset
            </button>
          </div>

          <FormError message={error} />

          <div className="space-y-2 border-t border-taupe/40 pt-5">
            <button type="button" className="btn-primary w-full" disabled={!current || saving || (unchanged && !!initial)} onClick={() => current && save(current)}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-outline w-full" disabled={saving} onClick={onSkip}>
              {skipLabel}
            </button>
            {initial ? (
              <button type="button" className="link block w-full py-1 text-center text-sm text-burgundy" disabled={saving} onClick={() => save(null)}>
                Undo all edits (show as uploaded)
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}
