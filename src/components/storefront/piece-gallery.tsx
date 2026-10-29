"use client";

import { useEffect, useRef, useState } from "react";
import { preloadPhoto } from "@/components/brand/fading-photo";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { useSelection } from "./piece-selection";
import { turnFrames, type PhotoAngle } from "@/lib/photo-turn";
import { PhotoViewer } from "./photo-viewer";
import { SpinViewer } from "./spin-viewer";
import { TurnViewer } from "./turn-viewer";

const SLIDE_SIZES = "(min-width: 768px) 56vw, 80vw";

export type GalleryImage = { url: string; alt: string; color: string | null; angle: PhotoAngle | null };

/**
 * The piece's pictures for the chosen colour: its own photos plus any photo
 * of every colour. With none, the painted sketch, washed in the colour.
 *
 * Photos sit in a row to swipe through (on phones the next one peeks in, so
 * it's plain there are more), with a count and thumbnails beneath, and
 * arrows on wide screens. Tapping one opens it full screen to zoom in. A new
 * colour's first photo crossfades over the last (the plate keeps its place),
 * and the row goes back to the start. With a turning video, or front, side
 * and back photos, a button swaps the row for a drag-to-turn view.
 */
export function PieceGallery({
  slug,
  title,
  name,
  tone,
  pieceNumber,
  pieceName,
  category,
  images,
  spinVideo,
}: {
  slug: string;
  title: string;
  name: string;
  tone: string | null;
  pieceNumber: number | null;
  pieceName: string | null;
  category: string | null;
  images: GalleryImage[];
  /** A video of the piece turning round once, or null. */
  spinVideo: string | null;
}) {
  const [turning, setTurning] = useState(false);
  const [index, setIndex] = useState(0);
  // The photo opened full screen, and the copies of each already on screen (read when it's tapped).
  const [viewing, setViewing] = useState<{ at: number; copies: (string | undefined)[] } | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const { colours, colour } = useSelection();
  const chosen = colours.find((c) => c.name === colour);
  const own = images.filter((i) => i.color === colour);
  const shared = images.filter((i) => i.color === null);
  // Photos of this colour first; with none for it yet, photos of every colour.
  const shown = own.length ? [...own, ...shared] : shared;
  const label = `${title}, ${name}${colour ? `, in ${colour}` : ""}`;
  const tint = chosen?.hex ?? tone;
  // The colour's own front, side and back; else those of every colour. A video turns more smoothly, so it wins.
  const frames = spinVideo ? null : (turnFrames(own) ?? turnFrames(shared));
  const canTurn = Boolean(spinVideo || frames);

  // A new colour starts again from its first photo.
  const [shownColour, setShownColour] = useState(colour);
  if (shownColour !== colour) {
    setShownColour(colour);
    setIndex(0);
  }
  useEffect(() => {
    track.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [colour]);

  // Once the page has settled, fetch every other colour's main photo, so choosing one shows it at once.
  useEffect(() => {
    const heroes = colours.map((c) => (images.find((i) => i.color === c.name) ?? images.find((i) => i.color === null))?.url);
    const run = () => heroes.forEach((url) => preloadPhoto(url, SLIDE_SIZES));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 1500);
    return () => clearTimeout(id);
  }, [colours, images]);

  /** The slide nearest the middle of the row, as it's swiped. */
  function onScroll() {
    const el = track.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    [...el.children].forEach((child, i) => {
      const c = child as HTMLElement;
      const best = el.children[nearest] as HTMLElement;
      if (Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - middle)) nearest = i;
    });
    setIndex(nearest);
  }

  function open(at: number) {
    const slides = [...(track.current?.children ?? [])];
    setViewing({ at, copies: slides.map((li) => li.querySelector<HTMLImageElement>("img:last-of-type")?.currentSrc || undefined) });
  }

  function goTo(i: number) {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: "smooth" });
    setIndex(i);
  }

  if (turning && (spinVideo || frames)) {
    return (
      <div>
        <div className="fade-in mx-auto w-[84%] md:w-full">
          {spinVideo ? (
            <SpinViewer key={spinVideo} video={spinVideo} label={label} tone={tint} />
          ) : (
            <TurnViewer key={colour ?? ""} frames={frames!} label={label} tone={tint} />
          )}
        </div>
        <p className="mt-4 text-center">
          <button type="button" className="link text-sm" aria-pressed onClick={() => setTurning(false)}>
            Back to the photos
          </button>
        </p>
      </div>
    );
  }

  // No photograph yet: the sketch, alone.
  if (shown.length === 0) {
    return (
      <div className="fade-in mx-auto w-[84%] md:w-full">
        <Plate
          transitionName={pieceTransitionName(slug)}
          src={null}
          alt={label}
          tone={tint}
          pieceNumber={pieceNumber}
          pieceName={pieceName}
          category={category}
          sketchNote
          sizes={SLIDE_SIZES}
          priority
        />
      </div>
    );
  }

  const many = shown.length > 1;
  return (
    <div className="relative">
      <ul
        ref={track}
        onScroll={onScroll}
        className={`gallery-track flex snap-x snap-mandatory gap-3 overflow-x-auto ${many ? "px-[10%] md:px-0" : "px-[8%] md:px-0"}`}
        aria-label={`Photos of ${label}`}
      >
        {shown.map((img, i) => (
          // Keyed by place, not photo: the plate stays put and a new colour's photo crossfades into it.
          <li key={i} className={`shrink-0 snap-center ${many ? "w-[80%]" : "w-[84%]"} md:w-full`}>
            <button type="button" className="block w-full cursor-zoom-in" onClick={() => open(i)} aria-label={`Enlarge photo ${i + 1} of ${shown.length}`}>
              <Plate
                transitionName={i === 0 ? pieceTransitionName(slug) : undefined}
                src={img.url}
                alt={img.alt || (i === 0 ? label : `${label}, view ${i + 1}`)}
                tone={tint}
                sizes={SLIDE_SIZES}
                priority={i === 0}
              />
            </button>
          </li>
        ))}
      </ul>

      {many ? (
        <>
          {/* Wide screens: arrows over the photo. Phones swipe. */}
          <button type="button" className="gallery-arrow left-3" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous photo">
            ←
          </button>
          <button type="button" className="gallery-arrow right-3" onClick={() => goTo(Math.min(shown.length - 1, index + 1))} disabled={index === shown.length - 1} aria-label="Next photo">
            →
          </button>
        </>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-4 px-[10%] md:px-0">
        {many ? (
          <ol className="flex gap-2" aria-label="Choose a photo">
            {shown.map((img, i) => (
              <li key={img.url}>
                <button type="button" className="gallery-thumb" aria-current={i === index ? "true" : undefined} onClick={() => goTo(i)} aria-label={`Photo ${i + 1}`}>
                  <Plate src={img.url} alt="" tone={tint} sizes="56px" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
          {many ? (
            <span className="tabular-nums text-espresso-soft" aria-live="polite">
              {index + 1} / {shown.length}
            </span>
          ) : null}
          {canTurn ? (
            <button type="button" className="link" onClick={() => setTurning(true)}>
              {spinVideo ? "See it turn, 360°" : "See it from every side"}
            </button>
          ) : null}
        </div>
      </div>

      {viewing !== null ? (
        <PhotoViewer
          photos={shown.map((img, i) => ({
            url: img.url,
            alt: img.alt || `${label}, view ${i + 1}`,
            shown: viewing.copies[i],
          }))}
          start={viewing.at}
          tone={tint}
          onClose={(at) => {
            setViewing(null);
            goTo(at);
          }}
        />
      ) : null}
    </div>
  );
}
