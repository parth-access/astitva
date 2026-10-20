import Link from "next/link";
import { PieceCaption, pieceHref, pieceTitle } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import type { PieceCard } from "@/modules/catalog/queries";

/**
 * The browsing view: every piece at once, for shoppers who know what they
 * want. Quieter than the spreads; the middle column steps down on wide
 * screens so a row reads like a window display rather than a spreadsheet.
 */
export function ProductGrid({ pieces, priorityCount = 0 }: { pieces: PieceCard[]; priorityCount?: number }) {
  if (pieces.length === 0) {
    return <p className="caption py-16 text-2xl">Nothing here at the moment. New pieces are on their way.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-14 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12 lg:[&>li:nth-child(3n+2)]:translate-y-16">
      {pieces.map((p, i) => (
        <li key={p.id}>
          <Link href={pieceHref(p.slug)} transitionTypes={["nav-forward"]} aria-label={`${pieceTitle(p)}, ${p.name}`} className="block">
            <Plate
              transitionName={pieceTransitionName(p.slug)}
              src={p.imageUrl}
              alt={p.imageAlt}
              tone={p.tone}
              pieceNumber={p.pieceNumber}
              pieceName={p.pieceName}
              category={p.categorySlug}
              muted={p.onHand <= 0}
              sizes="(min-width: 1024px) 30vw, 46vw"
              priority={i < priorityCount}
            />
          </Link>
          <div className="mt-5">
            <PieceCaption piece={p} size="grid" showStory={false} />
          </div>
        </li>
      ))}
    </ul>
  );
}
