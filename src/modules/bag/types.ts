/** The bag as the browser sees it. Safe to import from client components. */

/** Most of one colour and size a bag may hold (the database allows 1–10). */
export const MAX_PER_LINE = 10;

export type BagLine = {
  id: string;
  variantId: string;
  slug: string;
  name: string;
  pieceName: string | null;
  pieceNumber: number | null;
  categorySlug: string | null;
  colour: string | null;
  colourHex: string | null;
  tone: string | null;
  size: string | null;
  imageUrl: string | null;
  imageAlt: string;
  priceMinor: number;
  quantity: number;
  /** Units that can be bought right now. */
  available: number;
  /** Still on sale (published and offered). */
  onSale: boolean;
};

export type Bag = {
  lines: BagLine[];
  count: number;
  subtotalMinor: number;
  /** A line that can't be bought as it stands (sold out, fewer left, or withdrawn). */
  hasProblems: boolean;
};

export const EMPTY_BAG: Bag = { lines: [], count: 0, subtotalMinor: 0, hasProblems: false };

/** Why a line can't be bought as it stands, or null. */
export function lineProblem(line: Pick<BagLine, "onSale" | "available" | "quantity">): "withdrawn" | "sold_out" | "fewer_left" | null {
  if (!line.onSale) return "withdrawn";
  if (line.available <= 0) return "sold_out";
  if (line.quantity > line.available) return "fewer_left";
  return null;
}
