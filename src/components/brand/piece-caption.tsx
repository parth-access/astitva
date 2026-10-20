import Link from "next/link";
import { Price } from "@/components/storefront/price";
import { firstSentence, formatPieceNumber } from "@/lib/format";
import type { PieceCard } from "@/modules/catalog/queries";

export function pieceHref(slug: string) {
  return `/pieces/${slug}`;
}

/** Title used wherever a piece is named: "Saanjh", falling back to the plain description. */
export function pieceTitle(p: { pieceName: string | null; name: string }) {
  return p.pieceName ?? p.name;
}

export function availabilityNote(p: Pick<PieceCard, "onHand" | "variantCount">) {
  if (p.onHand <= 0) return "Sold out";
  if (p.onHand <= 2) return `Only ${p.onHand} left`;
  return null;
}

/**
 * The text that accompanies a plate: number, given name, what it is,
 * one line of its story, price. `size` sets the scale for spreads vs grids.
 */
export function PieceCaption({
  piece,
  size = "spread",
  headingLevel = "h3",
  showStory = true,
}: {
  piece: PieceCard;
  size?: "spread" | "grid";
  headingLevel?: "h2" | "h3";
  showStory?: boolean;
}) {
  const Heading = headingLevel;
  const note = availabilityNote(piece);
  const story = showStory ? firstSentence(piece.story) : null;
  const big = size === "spread";

  return (
    <div>
      {piece.pieceNumber ? (
        <p className={`font-display tabular-nums text-espresso-soft ${big ? "text-2xl" : "text-sm"}`}>
          {formatPieceNumber(piece.pieceNumber)}
        </p>
      ) : null}
      <Heading className={`${big ? "mt-1 text-5xl md:text-6xl" : "mt-0.5 text-2xl"} italic`}>
        <Link href={pieceHref(piece.slug)} className="hover:text-burgundy" transitionTypes={["nav-forward"]}>
          {pieceTitle(piece)}
        </Link>
      </Heading>
      {piece.pieceName ? <p className={`${big ? "mt-3 text-sm" : "mt-1 text-xs"} text-espresso-soft`}>{piece.name}</p> : null}
      {story ? <p className={`caption ${big ? "mt-6 max-w-sm" : "mt-2"}`}>{story}</p> : null}
      <div className={`flex flex-wrap items-baseline gap-x-4 ${big ? "mt-6 text-base" : "mt-2 text-sm"}`}>
        {piece.onHand > 0 ? (
          <Price priceMinor={piece.priceMinor} compareAtMinor={piece.compareAtMinor} />
        ) : null}
        {note ? (
          <span className={`font-accent italic ${big ? "text-xl" : "text-lg"} ${piece.onHand > 0 ? "text-olive" : "text-espresso-soft"}`}>
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
