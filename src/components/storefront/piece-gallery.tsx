"use client";

import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { useSelection } from "./piece-selection";

export type GalleryImage = { url: string; alt: string; color: string | null };

/**
 * The piece's pictures for the chosen colour: its own photos plus any photo
 * of every colour. With none, the painted sketch, washed in the colour. A
 * newly chosen colour's photos fade in; the sketch repaints in place.
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
}: {
  slug: string;
  title: string;
  name: string;
  tone: string | null;
  pieceNumber: number | null;
  pieceName: string | null;
  category: string | null;
  images: GalleryImage[];
}) {
  const { colours, colour } = useSelection();
  const chosen = colours.find((c) => c.name === colour);
  const own = images.filter((i) => i.color === colour);
  const shared = images.filter((i) => i.color === null);
  // Photos of this colour first; with none for it yet, photos of every colour.
  const shown = own.length ? [...own, ...shared] : shared.length ? shared : [];
  const [hero, ...rest] = shown;
  const label = `${title}, ${name}${colour ? `, in ${colour}` : ""}`;

  return (
    <>
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
