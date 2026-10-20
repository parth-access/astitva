import Image from "next/image";
import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import { isCloudinaryUrl } from "@/lib/cloudinary-url";
import { formatPieceNumber } from "@/lib/format";
import { inkOn, normaliseTone } from "@/lib/tone";
import { garmentKind, SketchPlate } from "@/components/lookbook/sketch-plate";
import { CloudImage } from "./cloud-image";

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
  /** Dim the plate (a sold-out piece). */
  muted?: boolean;
  /** Shown centred on a photo-less plate that has no number or name (e.g. brand art). */
  emblem?: ReactNode;
  /** "cover" fills the arch (photographs); "illustration" fits the image inside, resting on the base. */
  fit?: "cover" | "illustration";
  /**
   * A piece's category slug. Without a photograph, a piece with a known
   * category is shown as a painted sketch of its garment instead of a plain
   * tone (undefined keeps the plain tone, e.g. for brand art).
   */
  category?: string | null;
  /** Show "Sketched until photographed" under a sketch (large plates only). */
  sketchNote?: boolean;
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
  category,
  sketchNote = false,
  className = "",
}: Props) {
  const colour = normaliseTone(tone);
  const ink = inkOn(colour);
  const style = { aspectRatio: ratio, backgroundColor: colour } as CSSProperties;
  const imageClass = fit === "illustration" ? "object-contain object-bottom px-[6%] pt-[14%]" : "object-cover";

  const sketch = !src && category !== undefined;
  const plate = sketch ? (
    <div className={`arch paper-plate relative w-full ${muted ? "opacity-70 saturate-50" : ""} ${className}`} style={{ aspectRatio: ratio }}>
      <div className={`absolute inset-x-[6%] top-[8%] ${sketchNote ? "bottom-[11%]" : "bottom-[3%]"}`}>
        <SketchPlate
          kind={garmentKind(category)}
          tone={tone}
          label={`Sketch of ${alt}`}
          seed={pieceNumber ?? 1}
        />
      </div>
      {sketchNote ? (
        <span className="caption absolute bottom-3 left-0 right-0 text-center text-sm text-espresso-soft">Sketched until photographed</span>
      ) : null}
    </div>
  ) : (
    <div className={`arch relative w-full ${muted ? "opacity-70 saturate-50" : ""} ${className}`} style={style}>
      {src ? (
        // Photos on Cloudinary are resized there; local art (the mascot) goes through next/image.
        isCloudinaryUrl(src) ? (
          <CloudImage src={src} alt={alt} fill sizes={sizes} priority={priority} className={imageClass} />
        ) : (
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={imageClass} />
        )
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
