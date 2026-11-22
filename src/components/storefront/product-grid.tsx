import { PieceCaption } from "@/components/brand/piece-caption";
import type { PieceCard } from "@/modules/catalog/queries";
import { ShopCard } from "./shop-card";
import { SortedGrid } from "./shop-sort";

const GRID = "grid grid-cols-2 gap-x-4 gap-y-14 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12 lg:[&>li:nth-child(3n+2)]:translate-y-16";

/**
 * The browsing view: every piece at once, for shoppers who know what they
 * want. Quieter than the spreads; the middle column steps down on wide
 * screens so a row reads like a window display rather than a spreadsheet.
 * `sortable`: the order follows the address's ?sort= (the shop pages).
 */
export function ProductGrid({ pieces, priorityCount = 0, sortable = false }: { pieces: PieceCard[]; priorityCount?: number; sortable?: boolean }) {
  if (pieces.length === 0) {
    return <p className="caption py-16 text-2xl">Nothing here at the moment. New pieces are on their way.</p>;
  }
  const cards = pieces.map((p, i) => ({
    id: p.id,
    keys: { at: i, priceMinor: p.priceMinor, publishedAt: p.publishedAt ? new Date(p.publishedAt).getTime() : null, name: p.pieceName ?? p.name },
    card: <ShopCard piece={p} priority={i < priorityCount} caption={<PieceCaption piece={p} size="grid" showStory={false} />} />,
  }));
  if (sortable) return <SortedGrid cards={cards} className={GRID} />;
  return (
    <ul className={GRID}>
      {cards.map((c) => (
        <li key={c.id}>{c.card}</li>
      ))}
    </ul>
  );
}
