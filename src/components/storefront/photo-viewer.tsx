"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { normaliseTone } from "@/lib/tone";

/** `shown`: the copy already on screen in the gallery (its exact address), shown while the sharp one loads. */
type Photo = { url: string; alt: string; shown?: string };

/**
 * A piece's photos full screen, to look closely at the fabric and the
 * finish. Swipe or use the arrows (and arrow keys) between them; tap a photo
 * to zoom in where you tapped, then drag or scroll round it; tap again to
 * zoom out. Escape, the close button or the backdrop closes it, and the
 * gallery behind follows to the photo last seen.
 */
export function PhotoViewer({ photos, start, tone, onClose }: { photos: Photo[]; start: number; tone: string | null; onClose: (at: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState<number | null>(null);

  useEffect(() => {
    const d = dialog.current!;
    // No closing on cleanup: that fires "close", which would tell the gallery to unmount the viewer
    // (and React runs effects twice in development). Removing the open dialog closes it anyway.
    if (!d.open) d.showModal();
    // Open on the photo that was tapped, without a scroll animation, once the dialog has its size.
    const frame = requestAnimationFrame(() => {
      const slide = track.current?.children[start] as HTMLElement | undefined;
      if (slide && track.current) track.current.scrollLeft = slide.offsetLeft;
    });
    return () => cancelAnimationFrame(frame);
  }, [start]);

  function goTo(i: number) {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    setZoomed(null);
    el.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }

  function onScroll() {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) {
      setIndex(i);
      setZoomed(null);
    }
  }

  /** Zoom in on the tapped point (the frame scrolls so it stays under the finger), or back out. */
  function toggleZoom(i: number, e: MouseEvent<HTMLButtonElement>) {
    if (zoomed === i) {
      setZoomed(null);
      return;
    }
    const frame = e.currentTarget.parentElement!;
    const box = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    setZoomed(i);
    requestAnimationFrame(() => {
      frame.scrollLeft = fx * frame.scrollWidth - frame.clientWidth / 2;
      frame.scrollTop = fy * frame.scrollHeight - frame.clientHeight / 2;
    });
  }

  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label="Photos, full screen"
      style={{ backgroundColor: normaliseTone(tone) }}
      onClose={() => onClose(index)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") goTo(Math.min(photos.length - 1, index + 1));
        if (e.key === "ArrowLeft") goTo(Math.max(0, index - 1));
      }}
    >
      <ul ref={track} onScroll={onScroll} className="gallery-track flex h-full snap-x snap-mandatory overflow-x-auto">
        {photos.map((p, i) => (
          <li key={p.url} className="h-full w-full shrink-0 snap-center">
            <div className={`viewer-frame h-full w-full ${zoomed === i ? "overflow-auto" : "overflow-hidden"}`}>
              <button
                type="button"
                className={`relative block ${zoomed === i ? "h-[220%] w-[220%] cursor-zoom-out" : "h-full w-full cursor-zoom-in"}`}
                onClick={(e) => toggleZoom(i, e)}
                aria-label={zoomed === i ? "Zoom out" : "Zoom in"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- sized by Cloudinary; next/image's fill can't grow past the frame for zoom */}
                <img
                  // The gallery's own copy first (already downloaded), so something shows at once…
                  src={p.shown || cloudinaryUrl(p.url, { width: 828 })}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
                <img
                  // …then a sharp one, fine enough to zoom into, fades in over it. One size for both states: changing it on zoom would blink.
                  src={cloudinaryUrl(p.url, { width: 2000 })}
                  alt={p.alt}
                  className="relative h-full w-full object-contain opacity-0 transition-opacity duration-500"
                  onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
                  loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"}
                  draggable={false}
                />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="viewer-bar">
        <span className="tabular-nums">
          {index + 1} / {photos.length}
        </span>
        {photos.length > 1 ? (
          <span className="flex gap-2">
            <button type="button" className="viewer-button" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous photo">
              ←
            </button>
            <button type="button" className="viewer-button" onClick={() => goTo(Math.min(photos.length - 1, index + 1))} disabled={index === photos.length - 1} aria-label="Next photo">
              →
            </button>
          </span>
        ) : null}
        <button type="button" className="viewer-button px-4" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
