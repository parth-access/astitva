"use client";

import { useState } from "react";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { useSelection } from "./piece-selection";
import { turnFrames, type PhotoAngle } from "@/lib/photo-turn";
import { SpinViewer } from "./spin-viewer";
import { TurnViewer } from "./turn-viewer";

export type GalleryImage = { url: string; alt: string; color: string | null; angle: PhotoAngle | null };

/**
 * The piece's pictures for the chosen colour: its own photos plus any photo
 * of every colour. With none, the painted sketch, washed in the colour. A
 * newly chosen colour's photos fade in; the sketch repaints in place. With
 * a turning video, a button swaps the first picture for a drag-to-turn view;
 * without one, the same from the colour's front, side and back photos.
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
  const { colours, colour } = useSelection();
  const chosen = colours.find((c) => c.name === colour);
  const own = images.filter((i) => i.color === colour);
  const shared = images.filter((i) => i.color === null);
  // Photos of this colour first; with none for it yet, photos of every colour.
  const shown = own.length ? [...own, ...shared] : shared.length ? shared : [];
  const [hero, ...rest] = shown;
  const label = `${title}, ${name}${colour ? `, in ${colour}` : ""}`;
  // The colour's own front, side and back; else those of every colour. A video turns more smoothly, so it wins.
  const frames = spinVideo ? null : (turnFrames(own) ?? turnFrames(shared));
  const canTurn = Boolean(spinVideo || frames);

  return (
    <>
      {spinVideo && turning ? (
        <div className="fade-in">
          <SpinViewer key={spinVideo} video={spinVideo} label={label} tone={chosen?.hex ?? tone} />
        </div>
      ) : frames && turning ? (
        <div className="fade-in">
          <TurnViewer key={colour ?? ""} frames={frames} label={label} tone={chosen?.hex ?? tone} />
        </div>
      ) : (
        <div key={hero ? hero.url : "sketch"} className={hero ? "fade-in" : undefined}>
          <Plate
            transitionName={pieceTransitionName(slug)}
            src={hero?.url ?? null}
            alt={hero ? hero.alt || label : label}
            tone={chosen?.hex ?? tone}
            pieceNumber={pieceNumber}
            pieceName={pieceName}
            category={category}
            sketchNote
            sizes="(min-width: 768px) 56vw, 92vw"
            priority
          />
        </div>
      )}
      {canTurn ? (
        <p className="mt-3 text-center">
          <button type="button" className="link text-sm" aria-pressed={turning} onClick={() => setTurning((t) => !t)}>
            {turning ? "Back to the photo" : spinVideo ? "See it turn, 360°" : "See it from every side"}
          </button>
        </p>
      ) : null}
      {rest.length > 0 && (
        <ul key={colour ?? ""} className="fade-in mt-6 grid grid-cols-2 gap-6">
          {rest.map((img, i) => (
            <li key={img.url}>
              <Plate src={img.url} alt={img.alt || `${label}, view ${i + 2}`} tone={chosen?.hex ?? tone} sizes="(min-width: 768px) 27vw, 46vw" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
