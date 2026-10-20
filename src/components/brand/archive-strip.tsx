import Link from "next/link";
import { formatMonthYear, formatPieceNumber } from "@/lib/format";
import type { ArchivedPiece } from "@/modules/catalog/queries";
import { pieceHref } from "./piece-caption";
import { pieceTransitionName, Plate } from "./plate";

export function homeLine(p: ArchivedPiece) {
  return p.city ? `Went home to ${p.city}, ${formatMonthYear(p.soldAt)}` : `Found its home, ${formatMonthYear(p.soldAt)}`;
}

/** Small arches for pieces that have sold. Pieces stay visible: they are the house's record. */
export function ArchiveGrid({ pieces, withTransitions = true }: { pieces: ArchivedPiece[]; withTransitions?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-10">
      {pieces.map((p) => (
        <li key={p.id}>
          <Link href={pieceHref(p.slug)} className="group block" transitionTypes={["nav-forward"]}>
            <Plate
              transitionName={withTransitions ? pieceTransitionName(p.slug) : undefined}
              src={p.imageUrl}
              alt={p.imageAlt}
              tone={p.tone}
              pieceNumber={p.pieceNumber}
              pieceName={p.pieceName}
              category={p.categorySlug}
              muted
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw"
            />
            <p className="mt-4 font-display text-sm tabular-nums text-espresso-soft">
              {p.pieceNumber ? formatPieceNumber(p.pieceNumber) : null}
            </p>
            <p className="font-display text-xl italic group-hover:text-burgundy">{p.pieceName ?? p.name}</p>
            <p className="caption mt-1 text-base">{homeLine(p)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
