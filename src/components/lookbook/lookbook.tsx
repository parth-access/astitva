import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Letter } from "@/components/brand/letter";
import { MASCOT_GROUND } from "@/components/brand/mascot-data";
import { pieceHref } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { Price } from "@/components/storefront/price";
import { firstSentence, formatLongDate, formatPieceNumber, paragraphs, toRoman } from "@/lib/format";
import type { Chapter, LookbookPiece } from "@/modules/catalog/queries";

/**
 * The home page as a printed lookbook: a cover spread, a contents page, then
 * one page per piece. Pages carry the furniture of print (running heads,
 * folios, a gutter), and on wide screens each page slides over the last like
 * a turned leaf.
 */

/** Lowercase Roman folios for the front matter, Arabic for the plates. */
function Folio({ children, side, wideOnly = false }: { children: ReactNode; side: "left" | "right"; wideOnly?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`folio absolute bottom-5 ${side === "left" ? "left-5 sm:left-8" : "right-5 sm:right-8"} ${wideOnly ? "hidden md:inline" : ""}`}
    >
      {children}
    </span>
  );
}

function RunningHead({ children, side = "right", wideOnly = false }: { children: ReactNode; side?: "left" | "right"; wideOnly?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`folio absolute top-5 ${side === "left" ? "left-5 sm:left-8" : "right-5 sm:right-8"} ${wideOnly ? "hidden md:inline" : ""}`}
    >
      {children}
    </span>
  );
}

function pieceTitle(p: LookbookPiece) {
  return p.pieceName ?? p.name;
}

/** The plate for a piece: its photograph, or until there is one, the painted sketch. It morphs into the piece page. */
function PiecePlate({ piece, priority }: { piece: LookbookPiece; priority?: boolean }) {
  const label = `${piece.pieceNumber ? `${formatPieceNumber(piece.pieceNumber)} ` : ""}${pieceTitle(piece)}, ${piece.name}`;
  return (
    <Plate
      transitionName={pieceTransitionName(piece.slug)}
      src={piece.imageUrl}
      alt={piece.imageUrl ? piece.imageAlt || label : label}
      tone={piece.tone}
      pieceNumber={piece.pieceNumber}
      pieceName={piece.pieceName}
      category={piece.categorySlug}
      sketchNote
      sizes="(min-width: 768px) 42vw, 86vw"
      priority={priority}
    />
  );
}

export function LookbookCover({ chapter, pieces, now }: { chapter: Chapter; pieces: LookbookPiece[]; now: Date }) {
  const letterHref = `/chapters/${chapter.slug}#letter`;
  const opens = chapter.releaseAt ? `${chapter.releaseAt > now ? "Opens" : "Opened"} ${formatLongDate(chapter.releaseAt)}` : null;
  const opening = paragraphs(chapter.letter)[0];
  return (
    <section id="chapter" aria-label={`Chapter ${toRoman(chapter.number)}, ${chapter.title}`} className="spread relative">
      <div className="mx-auto grid max-w-7xl md:min-h-[calc(100svh-7rem)] md:grid-cols-2">
        {/* Right page first on phones: the picture leads. */}
        <div className="page relative flex items-end justify-center px-6 pb-14 pt-6 md:order-2 md:px-12 md:pb-20 md:pt-14">
          <RunningHead wideOnly>Plate i</RunningHead>
          <div className="cover-rise w-full max-w-[30rem]">
            <div className="arch relative w-full" style={{ aspectRatio: "3/4", backgroundColor: MASCOT_GROUND }}>
              <Image
                src="/brand/mascot.webp"
                alt="The Astitva woman in a wide-brimmed hat"
                fill
                priority
                sizes="(min-width: 768px) 40vw, 86vw"
                className="object-contain object-bottom px-[6%] pt-[14%]"
                // The painting is a rectangle on a slightly different ground: feather its edges into the arch.
                style={{
                  maskImage: "linear-gradient(to bottom, transparent 12%, black 30%), linear-gradient(to right, transparent 4%, black 16%, black 84%, transparent 96%)",
                  maskComposite: "intersect",
                }}
              />
            </div>
          </div>
          <Folio side="right" wideOnly>ii</Folio>
        </div>

        <div className="page relative flex flex-col justify-between px-6 pb-16 pt-14 md:order-1 md:px-12 md:pb-20 md:pt-14">
          <RunningHead side="left">Astitva · a lookbook</RunningHead>
          <div className="mt-6 md:mt-10">
            <p className="cover-settle caption text-2xl" style={{ ["--delay" as string]: "300ms" }}>
              Chapter {toRoman(chapter.number)}
            </p>
            {/* The title runs across the fold on wide screens, like a magazine headline. */}
            <h1
              className="cover-settle lookbook-title relative z-10 mt-1 italic leading-[0.85]"
              style={{ ["--delay" as string]: "450ms" }}
            >
              {chapter.title}
            </h1>
            {chapter.subtitle ? (
              <p className="cover-settle mt-8 max-w-sm text-lg leading-relaxed" style={{ ["--delay" as string]: "600ms" }}>
                {chapter.subtitle}
              </p>
            ) : null}
          </div>

          {opening ? (
            <figure className="cover-settle mt-12 max-w-sm" style={{ ["--delay" as string]: "750ms" }}>
              <blockquote className="caption text-xl leading-snug">“{firstSentence(opening, 160)}”</blockquote>
              <figcaption className="mt-3 flex items-baseline gap-5">
                {chapter.letterSignature ? <span className="signature text-4xl">{chapter.letterSignature}</span> : null}
                <Link href={letterHref} className="link text-sm">
                  Read her letter
                </Link>
              </figcaption>
            </figure>
          ) : null}

          <div className="cover-settle mt-12 flex flex-wrap items-end justify-between gap-6 text-sm" style={{ ["--delay" as string]: "900ms" }}>
            <p className="text-espresso-soft">
              {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}, most of them one of one
              {opens ? <span className="block">{opens}</span> : null}
            </p>
            <a href="#pieces" className="link">
              Turn the page ↓
            </a>
          </div>
          <Folio side="left" wideOnly>i</Folio>
        </div>
      </div>
    </section>
  );
}

export function LookbookContents({ chapter, pieces, folio = "iii" }: { chapter: Chapter; pieces: LookbookPiece[]; folio?: string }) {
  return (
    <section id="pieces" aria-labelledby="contents-heading" className="leaf relative scroll-mt-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-12 md:px-12 md:py-28">
        <RunningHead side="left">Chapter {toRoman(chapter.number)}, {chapter.title}</RunningHead>
        <div className="md:col-span-4">
          <p className="caption text-xl">In this chapter</p>
          <h2 id="contents-heading" className="mt-1 text-5xl md:text-6xl">
            Contents
          </h2>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-espresso-soft">
            Each piece is numbered once and never again. When one finds its home, it stays here, marked.
          </p>
        </div>
        <ol className="md:col-span-7 md:col-start-6">
          {pieces.map((p, i) => {
            const gone = p.onHand <= 0;
            return (
              <li key={p.id}>
                <a href={`#${p.slug}`} className={`contents-row group ${gone ? "text-espresso-soft" : ""}`}>
                  <span className="w-14 shrink-0 font-display tabular-nums text-espresso-soft">
                    {p.pieceNumber ? formatPieceNumber(p.pieceNumber) : "—"}
                  </span>
                  <span className="font-display text-2xl italic group-hover:text-burgundy md:text-3xl">{pieceTitle(p)}</span>
                  <span className="leader" aria-hidden="true" />
                  <span className="hidden text-sm text-espresso-soft sm:inline">{gone ? "found its home" : p.name}</span>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-espresso-soft">{i + 1}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
      <Folio side="right">{folio}</Folio>
    </section>
  );
}

export function LookbookPage({ chapter, piece, index }: { chapter: Chapter; piece: LookbookPiece; index: number }) {
  const flip = index % 2 === 1;
  const gone = piece.onHand <= 0;
  const oneOfOne = piece.variantCount === 1 && piece.onHand <= 1;
  return (
    <article id={piece.slug} aria-labelledby={`${piece.slug}-title`} className="leaf relative scroll-mt-0">
      <div className={`mx-auto grid max-w-7xl items-center gap-10 px-6 pb-20 pt-16 md:min-h-[100svh] md:grid-cols-12 md:gap-8 md:px-12 md:py-16`}>
        <RunningHead side={flip ? "right" : "left"}>
          Chapter {toRoman(chapter.number)}, {chapter.title}
        </RunningHead>

        <div className={`mx-auto w-[86%] max-w-[34rem] md:col-span-6 md:w-full ${flip ? "md:order-2 md:col-start-7" : ""}`}>
          <Link href={pieceHref(piece.slug)} transitionTypes={["nav-forward"]} aria-label={`${pieceTitle(piece)}, ${piece.name}`} className={gone ? "opacity-75 saturate-50" : ""}>
            <PiecePlate piece={piece} priority={index === 0} />
          </Link>
        </div>

        <div className={`md:col-span-5 ${flip ? "md:order-1 md:col-start-1" : "md:col-start-8"}`}>
          {piece.pieceNumber ? (
            <p className="font-display text-[clamp(3rem,7vw,6rem)] leading-none tabular-nums text-espresso-soft/70">
              {formatPieceNumber(piece.pieceNumber)}
            </p>
          ) : null}
          <h2 id={`${piece.slug}-title`} className="mt-2 text-[clamp(3.25rem,8vw,7rem)] italic leading-[0.9]">
            {pieceTitle(piece)}
          </h2>
          {piece.pieceName ? <p className="mt-4 text-sm text-espresso-soft">{piece.name}</p> : null}

          {piece.story ? <p className="caption mt-8 max-w-md text-xl leading-snug md:text-2xl">{firstSentence(piece.story, 200)}</p> : null}

          {piece.stylingNote ? (
            <figure className="mt-8 max-w-md border-l border-taupe pl-4">
              <blockquote className="text-sm leading-relaxed">{piece.stylingNote}</blockquote>
              {chapter.letterSignature ? <figcaption className="signature mt-1 text-2xl">{chapter.letterSignature}</figcaption> : null}
            </figure>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            {gone ? (
              <p className="caption text-xl">Found its home</p>
            ) : (
              <>
                <Price priceMinor={piece.priceMinor} compareAtMinor={piece.compareAtMinor} from={piece.variantCount > 1} className="text-lg" />
                {oneOfOne ? <span className="caption text-lg text-olive">One of one</span> : null}
              </>
            )}
            <Link href={pieceHref(piece.slug)} className="link text-sm">
              {gone ? "See the piece" : "See the piece and its measurements"}
            </Link>
          </div>
        </div>
      </div>
      <Folio side={flip ? "left" : "right"}>{index + 1}</Folio>
    </article>
  );
}

/** The founder's letter, given a page of its own, as in a printed lookbook. */
export function LookbookLetter({ chapter }: { chapter: Chapter }) {
  if (!paragraphs(chapter.letter).length) return null;
  return (
    <section id="letter" aria-label="A letter" className="leaf relative scroll-mt-0 py-20 md:py-28">
      <RunningHead side="left">Chapter {toRoman(chapter.number)}, {chapter.title}</RunningHead>
      <Letter text={chapter.letter} signature={chapter.letterSignature} id="letter-text" />
      <Folio side="right">iii</Folio>
    </section>
  );
}
