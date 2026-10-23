/**
 * "You might also like": other pieces from the same category, then, if
 * that's too few, from the categories after it in the shop's order
 * (wrapping round to the first). Only pieces that can be bought; never the
 * piece itself. Within a category, the shop's own order.
 *
 * A piece's category is its first one (the one that picks its sketch).
 * Pure, so it's tested without a database; catalog/queries feeds it.
 */

type Piece = { id: string; categorySlug: string | null; onHand: number };

export const RELATED_COUNT = 4;

export function pickRelated<P extends Piece>(current: Pick<Piece, "id" | "categorySlug">, pieces: P[], categoryOrder: string[], limit = RELATED_COUNT): P[] {
  const candidates = pieces.filter((p) => p.id !== current.id && p.onHand > 0);
  const start = current.categorySlug ? categoryOrder.indexOf(current.categorySlug) : -1;
  // This category first, then the ones after it, wrapping round; pieces without a category last.
  const order = start >= 0 ? [...categoryOrder.slice(start), ...categoryOrder.slice(0, start)] : categoryOrder;
  const rank = (p: P) => {
    const i = p.categorySlug ? order.indexOf(p.categorySlug) : -1;
    return i >= 0 ? i : order.length;
  };
  // A stable sort keeps the shop's order within each category.
  return candidates
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}
