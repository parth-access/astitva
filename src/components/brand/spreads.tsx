import Link from "next/link";
import type { PieceCard } from "@/modules/catalog/queries";
import { PieceCaption, pieceHref, pieceTitle } from "./piece-caption";
import { pieceTransitionName, Plate } from "./plate";

/**
 * Pieces laid out like pages of a lookbook rather than a product grid.
 * The rhythm repeats every three pieces:
 *   1. a single plate with its caption beside it
 *   2. two plates side by side, the second set lower
 *   (then 1 again, mirrored)
 * On phones every piece gets its own screen: plate, then caption.
 */
export function Spreads({ pieces, priorityCount = 1 }: { pieces: PieceCard[]; priorityCount?: number }) {
  const groups: { kind: "single" | "pair"; items: PieceCard[]; mirrored: boolean }[] = [];
  let i = 0;
  let singles = 0;
  while (i < pieces.length) {
    const remaining = pieces.length - i;
    const nextIsPair = groups.length % 2 === 1 && remaining >= 2;
    if (nextIsPair) {
      groups.push({ kind: "pair", items: pieces.slice(i, i + 2), mirrored: false });
      i += 2;
    } else {
      groups.push({ kind: "single", items: [pieces[i]!], mirrored: singles % 2 === 1 });
      singles++;
      i += 1;
    }
  }

  let index = 0;
  return (
    <div className="space-y-24 md:space-y-40">
      {groups.map((g) => {
        if (g.kind === "single") {
          const p = g.items[0]!;
          const priority = index++ < priorityCount;
          return (
            <article key={p.id} className="grid items-center gap-8 md:grid-cols-12 md:gap-10">
              <Link
                href={pieceHref(p.slug)}
                transitionTypes={["nav-forward"]}
                aria-label={`${pieceTitle(p)}, ${p.name}`}
                className={`block md:col-span-6 ${g.mirrored ? "md:col-start-7 md:row-start-1" : "md:col-start-1"}`}
              >
                <Plate
                  transitionName={pieceTransitionName(p.slug)}
                  src={p.imageUrl}
                  alt={p.imageAlt}
                  tone={p.tone}
                  pieceNumber={p.pieceNumber}
                  pieceName={p.pieceName}
                  muted={p.onHand <= 0}
                  sizes="(min-width: 768px) 48vw, 92vw"
                  priority={priority}
                />
              </Link>
              <div className={`md:row-start-1 ${g.mirrored ? "md:col-span-4 md:col-start-2" : "md:col-span-4 md:col-start-8"}`}>
                <PieceCaption piece={p} />
              </div>
            </article>
          );
        }
        return (
          <div key={g.items.map((p) => p.id).join("-")} className="grid gap-24 md:grid-cols-12 md:gap-10">
            {g.items.map((p, j) => {
              const priority = index++ < priorityCount;
              return (
                <article key={p.id} className={j === 0 ? "md:col-span-5 md:col-start-1" : "md:col-span-5 md:col-start-8 md:mt-40"}>
                  <Link href={pieceHref(p.slug)} transitionTypes={["nav-forward"]} aria-label={`${pieceTitle(p)}, ${p.name}`} className="block">
                    <Plate
                      transitionName={pieceTransitionName(p.slug)}
                      src={p.imageUrl}
                      alt={p.imageAlt}
                      tone={p.tone}
                      pieceNumber={p.pieceNumber}
                      pieceName={p.pieceName}
                      muted={p.onHand <= 0}
                      sizes="(min-width: 768px) 40vw, 92vw"
                      priority={priority}
                    />
                  </Link>
                  <div className="mt-8">
                    <PieceCaption piece={p} />
                  </div>
                </article>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
