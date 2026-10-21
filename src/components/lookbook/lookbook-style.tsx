"use client";

import Link from "next/link";
import { useState } from "react";
import { pieceHref } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { Price } from "@/components/storefront/price";
import { SwatchPicker } from "@/components/storefront/swatch-picker";
import { firstSentence, formatPieceNumber } from "@/lib/format";
import type { LookbookPiece } from "@/modules/catalog/queries";
import { Folio, RunningHead } from "./print";

/** The style's first colour that has stock, else its first colour. */
export function defaultColour(colours: LookbookPiece["colours"]) {
  return (colours.find((c) => c.available > 0) ?? colours[0])?.name ?? null;
}

/**
 * One style's page in the lookbook. Choosing a colour repaints the plate:
 * the sketch's wash eases to the new colour, or that colour's photograph
 * fades in. The choice travels to the piece page.
 */
export function LookbookPage({
  head,
  piece,
  index,
}: {
  head: string;
  piece: LookbookPiece;
  index: number;
}) {
  const flip = index % 2 === 1;
  const gone = piece.onHand <= 0;
  const [colour, setColour] = useState(() => defaultColour(piece.colours));
  const chosen = piece.colours.find((c) => c.name === colour) ?? piece.colours[0];
  const title = piece.pieceName ?? piece.name;
  const label = `${piece.pieceNumber ? `${formatPieceNumber(piece.pieceNumber)} ` : ""}${title}, ${piece.name}${chosen?.name ? `, in ${chosen.name}` : ""}`;
  const photo = chosen?.imageUrl ?? piece.imageUrl;
  const href = `${pieceHref(piece.slug)}${chosen?.name ? `?colour=${encodeURIComponent(chosen.name)}` : ""}`;

  return (
    <article id={piece.slug} aria-labelledby={`${piece.slug}-title`} className="leaf relative scroll-mt-0">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 pb-20 pt-16 md:min-h-[100svh] md:grid-cols-12 md:gap-8 md:px-12 md:py-16">
        <RunningHead side={flip ? "right" : "left"}>{head}</RunningHead>

        <div className={`mx-auto w-[86%] max-w-[34rem] md:col-span-6 md:w-full ${flip ? "md:order-2 md:col-start-7" : ""}`}>
          <Link href={href} transitionTypes={["nav-forward"]} aria-label={label} className={`block ${gone ? "opacity-75 saturate-50" : ""}`}>
            {/* Photos remount per colour so the new one fades in; the sketch stays and repaints. */}
            <div key={photo ? photo : "sketch"} className={photo ? "fade-in" : undefined}>
              <Plate
                transitionName={pieceTransitionName(piece.slug)}
                src={photo}
                alt={photo ? chosen?.imageAlt || piece.imageAlt || label : label}
                tone={chosen?.hex ?? piece.tone}
                pieceNumber={piece.pieceNumber}
                pieceName={piece.pieceName}
                category={piece.categorySlug}
                sketchNote
                sizes="(min-width: 768px) 42vw, 86vw"
                priority={index === 0}
              />
            </div>
          </Link>
        </div>

        <div className={`md:col-span-5 ${flip ? "md:order-1 md:col-start-1" : "md:col-start-8"}`}>
          {piece.pieceNumber ? (
            <p className="font-display text-[clamp(3rem,7vw,6rem)] leading-none tabular-nums text-espresso-soft/70">
              {formatPieceNumber(piece.pieceNumber)}
            </p>
          ) : null}
          <h2 id={`${piece.slug}-title`} className="mt-2 text-[clamp(3.25rem,8vw,7rem)] italic leading-[0.9]">
            {title}
          </h2>
          {piece.pieceName ? <p className="mt-4 text-sm text-espresso-soft">{piece.name}</p> : null}

          {piece.story ? <p className="caption mt-8 max-w-md text-xl leading-snug md:text-2xl">{firstSentence(piece.story, 200)}</p> : null}

          {piece.stylingNote ? (
            <figure className="mt-8 max-w-md border-l border-taupe pl-4">
              <blockquote className="text-sm leading-relaxed">{piece.stylingNote}</blockquote>
            </figure>
          ) : null}

          <div className="mt-8">
            <SwatchPicker colours={piece.colours} value={colour} onChange={setColour} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            {gone ? (
              <p className="caption text-xl">Sold out for now</p>
            ) : (
              <Price priceMinor={piece.priceMinor} compareAtMinor={piece.compareAtMinor} className="text-lg" />
            )}
            <Link href={href} transitionTypes={["nav-forward"]} className="link text-sm">
              {gone ? "See the piece" : chosen?.name ? `Choose a size in ${chosen.name}` : "Choose a size"}
            </Link>
          </div>
        </div>
      </div>
      <Folio side={flip ? "left" : "right"}>{index + 1}</Folio>
    </article>
  );
}
