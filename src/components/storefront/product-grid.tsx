import { PieceCaption } from "@/components/brand/piece-caption";
import type { PieceCard } from "@/modules/catalog/queries";
import { ShopCard } from "./shop-card";
import { SortedGrid } from "./shop-sort";
import { BREAK_EVERY, GridRows } from "./grid-rows";
import { breakPieces, choosePieces, EditorialBreak } from "./editorial-break";

/**
 * The browsing view: every piece at once, for shoppers who know what they
 * want. Quieter than the spreads; the middle column steps down on wide
 * screens so a row reads like a window display rather than a spreadsheet.
 * `sortable`: the order follows the address's ?sort= (the shop pages).
 * `breaks`: a full-width piece and a line of its story every two rows.
 */
export function ProductGrid({
  pieces,
  priorityCount = 0,
  sortable = false,
  breaks = false,
}: {
  pieces: PieceCard[];
  priorityCount?: number;
  sortable?: boolean;
  breaks?: boolean;
}) {
  if (pieces.length === 0) {
    return <p className="caption py-16 text-2xl">Nothing here at the moment. New pieces are on their way.</p>;
  }
  const cards = pieces.map((p, i) => ({
    id: p.id,
    keys: { at: i, priceMinor: p.priceMinor, publishedAt: p.publishedAt ? new Date(p.publishedAt).getTime() : null, name: p.pieceName ?? p.name },
    card: <ShopCard piece={p} priority={i < priorityCount} caption={<PieceCaption piece={p} size="grid" showStory={false} />} />,
  }));
  const featured = breaks ? choosePieces(breakPieces(pieces), Math.floor((pieces.length - 1) / BREAK_EVERY)) : [];
  const pauses = featured.map((p, k) => <EditorialBreak key={p.id} piece={p} flip={k % 2 === 1} />);
  if (sortable) return <SortedGrid cards={cards} breaks={pauses} />;
  return <GridRows cards={cards} breaks={pauses} />;
}
