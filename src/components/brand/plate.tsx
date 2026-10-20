import Image from "next/image";
import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import { formatPieceNumber } from "@/lib/format";
import { inkOn, normaliseTone } from "@/lib/tone";

type Props = {
  /** Shared-element name so the plate morphs into the piece page hero. Must be unique on the page. */
  transitionName?: string;
  src: string | null;
  alt: string;
  tone: string | null;
  pieceNumber?: number | null;
  pieceName?: string | null;
  /** Width / height. Product photography is shot 4:5. */
  ratio?: "4/5" | "3/4" | "2/3";
  sizes: string;
  priority?: boolean;
  /** Dim the plate (a piece that has found its home). */
  muted?: boolean;
  /** Shown centred on a photo-less plate that has no number or name (e.g. a chapter cover). */
  emblem?: ReactNode;
  /** "cover" fills the arch (photographs); "illustration" fits the image inside, resting on the base. */
  fit?: "cover" | "illustration";
  className?: string;
};

/**
 * Every piece sits in the arch. With a photograph, the tone shows while it
 * loads. Without one, the plate is set in the piece's colour with its number
 * and name, so the page reads as designed rather than empty.
 */
export function Plate({
  transitionName,
  src,
  alt,
  tone,
  pieceNumber,
  pieceName,
  ratio = "4/5",
  sizes,
  priority,
  muted,
  emblem,
  fit = "cover",
  className = "",
}: Props) {
  const colour = normaliseTone(tone);
  const ink = inkOn(colour);
  const style = { aspectRatio: ratio, backgroundColor: colour } as CSSProperties;

  const plate = (
    <div className={`arch relative w-full ${muted ? "opacity-70 saturate-50" : ""} ${className}`} style={style}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={fit === "illustration" ? "object-contain object-bottom px-[6%] pt-[14%]" : "object-cover"}
        />
      ) : (
        <div className={`plate-art absolute inset-0 ${ink === "light" ? "text-ivory" : "text-espresso"}`} role="img" aria-label={alt}>
          <div className="absolute inset-x-0 top-[40%] flex -translate-y-1/2 flex-col items-center px-6 text-center">
            {pieceNumber ? (
              <span className="font-display text-[clamp(0.8rem,3.2cqi,1.15rem)] tabular-nums opacity-75">{formatPieceNumber(pieceNumber)}</span>
            ) : null}
            {pieceName ? (
              <span className="mt-[2cqi] font-display text-[clamp(1.5rem,10cqi,4.5rem)] italic leading-none">{pieceName}</span>
            ) : null}
            {!pieceNumber && !pieceName && emblem ? <div className="w-[38%] opacity-70">{emblem}</div> : null}
          </div>
        </div>
      )}
    </div>
  );

  if (!transitionName) return plate;
  return (
    <ViewTransition name={transitionName} share="morph" default="none">
      {plate}
    </ViewTransition>
  );
}

export function pieceTransitionName(slug: string) {
  return `piece-${slug}`;
}
