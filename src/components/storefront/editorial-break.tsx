import Link from "next/link";
import { pieceHref } from "@/components/brand/piece-caption";
import { Plate } from "@/components/brand/plate";
import { formatPieceNumber } from "@/lib/format";
import type { PieceCard } from "@/modules/catalog/queries";

/**
 * A pause in the shop grid, like a full page in a lookbook: one piece, large,
 * beside the first line of its story in Krishna's words. The line is the
 * piece's "Where it was found", so it is edited where it always was.
 */

const MAX_QUOTE = 140;

/** The story's first sentence, if it is short enough to set large. */
export function storyLine(story: string | null): string | null {
  const text = story?.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const first = /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  return first.length <= MAX_QUOTE ? first : null;
}

/** The pieces a break can show: a photo and a short first line. */
export function breakPieces(pieces: PieceCard[]): PieceCard[] {
  return pieces.filter((p) => p.imageUrl && storyLine(p.story));
}

/**
 * Which pieces the `count` breaks show, spread through Krishna's order so a
 * break rarely sits next to its own card.
 */
export function choosePieces(candidates: PieceCard[], count: number): PieceCard[] {
  if (!candidates.length) return [];
  return Array.from({ length: Math.min(count, candidates.length) }, (_, k) => candidates[Math.floor(((k + 0.6) * candidates.length) / count) % candidates.length]!);
}

export function EditorialBreak({ piece, flip }: { piece: PieceCard; flip: boolean }) {
  const colour = piece.colours.find((c) => c.available > 0) ?? piece.colours[0];
  // The second photo of the colour (often the back) shows the piece in a way the card above did not.
  const photo = colour?.hoverUrl ?? colour?.imageUrl ?? piece.imageUrl;
  const title = piece.pieceName ?? piece.name;
  const href = `${pieceHref(piece.slug)}${colour?.name ? `?colour=${encodeURIComponent(colour.name)}` : ""}`;
  const line = storyLine(piece.story);

  return (
    <section aria-label={`${title}, from the collection`} className="rise my-24 grid items-center gap-10 md:grid-cols-12 md:gap-8 lg:my-40">
      <Link href={href} transitionTypes={["nav-forward"]} tabIndex={-1} aria-hidden className={`mx-auto block w-3/4 max-w-sm md:col-span-5 md:w-full md:max-w-none ${flip ? "md:col-start-8 md:row-start-1" : ""}`}>
        <Plate src={photo} alt="" tone={colour?.hex ?? piece.tone} sizes="(min-width: 768px) 38vw, 70vw" category={piece.categorySlug} pieceNumber={piece.pieceNumber} pieceName={piece.pieceName} />
      </Link>
      <div className={`text-center md:col-span-6 ${flip ? "md:col-start-1 md:row-start-1 md:text-right" : "md:col-start-7 md:text-left"}`}>
        {piece.pieceNumber ? <p className="caption text-xl">{formatPieceNumber(piece.pieceNumber)}</p> : null}
        <blockquote className="mt-4 text-balance font-display text-4xl italic leading-[1.1] md:text-5xl lg:text-6xl">“{line}”</blockquote>
        <Link href={href} transitionTypes={["nav-forward"]} className="link mt-8 inline-block text-sm uppercase tracking-[0.14em]">
          {title}
        </Link>
      </div>
    </section>
  );
}
