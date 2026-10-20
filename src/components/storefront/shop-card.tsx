"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { pieceHref } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { defaultColour } from "@/components/lookbook/lookbook-style";
import type { PieceCard } from "@/modules/catalog/queries";
import { SwatchPicker } from "./swatch-picker";

/**
 * A piece in the shop grid. Pointing at (or focusing) a swatch previews that
 * colour on the plate; choosing it opens the piece in that colour.
 */
export function ShopCard({ piece, priority, caption }: { piece: PieceCard; priority?: boolean; caption: ReactNode }) {
  const [colour, setColour] = useState(() => defaultColour(piece.colours));
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const shown = piece.colours.find((c) => c.name === (preview === undefined ? colour : preview)) ?? piece.colours[0];
  const photo = shown?.imageUrl ?? piece.imageUrl;
  const href = `${pieceHref(piece.slug)}${colour ? `?colour=${encodeURIComponent(colour)}` : ""}`;
  const title = piece.pieceName ?? piece.name;

  return (
    <div className="group">
      <Link href={href} transitionTypes={["nav-forward"]} aria-label={`${title}, ${piece.name}${colour ? `, in ${colour}` : ""}`} className="block">
        <div className="transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:-translate-y-1">
          <div key={photo ?? "sketch"} className={photo ? "fade-in" : undefined}>
            <Plate
              transitionName={pieceTransitionName(piece.slug)}
              src={photo}
              alt={photo ? shown?.imageAlt || piece.imageAlt : `${title}, ${piece.name}${shown?.name ? `, in ${shown.name}` : ""}`}
              tone={shown?.hex ?? piece.tone}
              pieceNumber={piece.pieceNumber}
              pieceName={piece.pieceName}
              category={piece.categorySlug}
              muted={piece.onHand <= 0}
              sizes="(min-width: 1024px) 30vw, 46vw"
              priority={priority}
            />
          </div>
        </div>
      </Link>
      {piece.colours.filter((c) => c.name).length > 1 ? (
        <div className="mt-4">
          <SwatchPicker colours={piece.colours} value={colour} onChange={setColour} onPreview={setPreview} size="sm" legend={`Colours of ${title}`} showName={false} />
        </div>
      ) : null}
      <div className="mt-4">{caption}</div>
    </div>
  );
}
