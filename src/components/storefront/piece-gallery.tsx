"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { preloadPhoto } from "@/components/brand/fading-photo";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { useSelection } from "./piece-selection";
import { turnFrames, type PhotoAngle } from "@/lib/photo-turn";
import type { RailGarment } from "@/lib/rail";
import { ClothingRail, HangerTurn } from "./clothing-rail";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
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
 *
 * With every colour on its hanger (the rail), the page opens on the rail
 * instead: swiping it changes the colour, and tapping the garment lifts it
 * off into the row, first in line and ready to turn round, before the photos.
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
  rail,
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
  /** Every colour on its hanger, or null for no rail (lib/rail). */
  rail: RailGarment[] | null;
}) {
  const [turning, setTurning] = useState(false);
  const [index, setIndex] = useState(0);
  // The photo opened full screen, and the copies of each already on screen (read when it's tapped).
  const [viewing, setViewing] = useState<{ at: number; copies: (string | undefined)[] } | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const { colours, colour, setColour } = useSelection();
  // On the rail, or looking closer (the row of photos).
  const [onRail, setOnRail] = useState(rail !== null);
  const hanger = rail?.find((g) => g.colour === colour) ?? null;
  // The hanger goes first in the row; photo i is slide i + lead.
  const lead = hanger ? 1 : 0;
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
    const slides = [...(track.current?.children ?? [])].slice(lead);
    setViewing({ at, copies: slides.map((li) => li.querySelector<HTMLImageElement>("img:last-of-type")?.currentSrc || undefined) });
  }

  function goTo(i: number) {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: "smooth" });
    setIndex(i);
  }

  if (rail && onRail) {
    return (
      <div className="fade-in">
        <ClothingRail
          slug={slug}
          label={label}
          garments={rail}
          colour={colour}
          onPick={setColour}
          onOpen={() => startTransition(() => setOnRail(false))}
        />
        <div className="mt-2 flex items-center justify-between gap-4 px-[10%] text-sm md:px-0">
          <span className="tabular-nums text-espresso-soft">
            {rail.length > 1 ? `${String(rail.findIndex((g) => g.colour === colour) + 1).padStart(2, "0")} / ${String(rail.length).padStart(2, "0")}` : null}
          </span>
          <button type="button" className="link" onClick={() => startTransition(() => setOnRail(false))}>
            {shown.length ? "Look closer and see the photos" : "Look closer"}
          </button>
        </div>
      </div>
    );
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

  // No photograph yet (and no hanger): the sketch, alone.
  if (shown.length === 0 && !hanger) {
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

  const total = shown.length + lead;
  const many = total > 1;
  return (
    <div className="relative">
      <ul
        ref={track}
        onScroll={onScroll}
        className={`gallery-track flex snap-x snap-mandatory gap-3 overflow-x-auto ${many ? "px-[10%] md:px-0" : "px-[8%] md:px-0"}`}
        aria-label={`Photos of ${label}`}
      >
        {hanger ? (
          <li className={`shrink-0 snap-center ${many ? "w-[80%]" : "w-[84%]"} md:w-full`}>
            <HangerTurn key={hanger.colour ?? ""} slug={slug} label={label} garment={hanger} />
          </li>
        ) : null}
        {shown.map((img, i) => (
          // Keyed by place, not photo: the plate stays put and a new colour's photo crossfades into it.
          <li key={i} className={`shrink-0 snap-center ${many ? "w-[80%]" : "w-[84%]"} md:w-full`}>
            <button type="button" className="block w-full cursor-zoom-in" onClick={() => open(i)} aria-label={`Enlarge photo ${i + 1} of ${shown.length}`}>
              <Plate
                transitionName={i === 0 && !hanger ? pieceTransitionName(slug) : undefined}
                src={img.url}
                alt={img.alt || (i === 0 ? label : `${label}, view ${i + 1}`)}
                tone={tint}
                sizes={SLIDE_SIZES}
                priority={i === 0 && !hanger}
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
          <button type="button" className="gallery-arrow right-3" onClick={() => goTo(Math.min(total - 1, index + 1))} disabled={index === total - 1} aria-label="Next photo">
            →
          </button>
        </>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-4 px-[10%] md:px-0">
        {many ? (
          <ol className="flex gap-2" aria-label="Choose a photo">
            {hanger ? (
              <li>
                <button type="button" className="gallery-thumb hanger-thumb" aria-current={index === 0 ? "true" : undefined} onClick={() => goTo(0)} aria-label="On its hanger">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a 56px thumbnail of the cut-out, from Cloudinary at that size */}
                  <img src={cloudinaryUrl(hanger.front.url, { width: 112 })} alt="" className="aspect-[4/5] w-full object-contain" />
                </button>
              </li>
            ) : null}
            {shown.map((img, i) => (
              <li key={img.url}>
                <button type="button" className="gallery-thumb" aria-current={i + lead === index ? "true" : undefined} onClick={() => goTo(i + lead)} aria-label={`Photo ${i + 1}`}>
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
              {index + 1} / {total}
            </span>
          ) : null}
          {rail ? (
            <button type="button" className="link" onClick={() => startTransition(() => setOnRail(true))}>
              Back to the rail
            </button>
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
            goTo(at + lead);
          }}
        />
      ) : null}
    </div>
  );
}
