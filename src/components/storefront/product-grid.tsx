import { PieceCaption } from "@/components/brand/piece-caption";
import type { PieceCard } from "@/modules/catalog/queries";
import { ShopCard } from "./shop-card";

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
          <ShopCard piece={p} priority={i < priorityCount} caption={<PieceCaption piece={p} size="grid" showStory={false} />} />
        </li>
      ))}
    </ul>
  );
}
