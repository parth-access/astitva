import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Letter } from "@/components/brand/letter";
import { MASCOT_GROUND } from "@/components/brand/mascot-data";
import { pieceHref } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { Price } from "@/components/storefront/price";
import { firstSentence, formatPieceNumber, paragraphs } from "@/lib/format";
import type { LookbookPiece, PieceColour, Storefront } from "@/modules/catalog/queries";

/**
 * The home page as a printed lookbook: a cover spread, Krishna's note, a
 * contents page, then one page per style. Pages carry the furniture of print (running heads,
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

/** The lookbook's name, used as the running head on every page. */
function headOf(store: Storefront) {
  return store.title ?? "Astitva";
}

/** "In 4 colours" / "In Sage" for a contents line. */
function colourLine(colours: PieceColour[]) {
  const named = colours.filter((c) => c.name);
  if (named.length === 0) return null;
  return named.length === 1 ? `In ${named[0]!.name}` : `In ${named.length} colours`;
}

/** The style's colours as small swatches; sold-out colours are struck through. */
export function Swatches({ colours, size = "md" }: { colours: PieceColour[]; size?: "sm" | "md" }) {
  const named = colours.filter((c) => c.name);
  if (named.length < 1) return null;
  const dot = size === "sm" ? "size-3.5" : "size-5";
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Colours">
      {named.map((c) => (
        <li key={c.name} className="flex items-center gap-1.5 text-sm">
          <span
            className={`swatch relative inline-block ${dot} rounded-full ${c.available <= 0 ? "swatch-out" : ""}`}
            style={{ backgroundColor: c.hex ?? "#d9c7ad" }}
            aria-hidden="true"
          />
          <span className={size === "sm" ? "sr-only" : c.available <= 0 ? "text-espresso-soft line-through decoration-1" : ""}>
            {c.name}
            {c.available <= 0 ? <span className="sr-only"> (sold out)</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
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

export function LookbookCover({ store, pieces }: { store: Storefront; pieces: LookbookPiece[] }) {
  const opening = paragraphs(store.note)[0];
  const colourCount = new Set(pieces.flatMap((p) => p.colours.flatMap((c) => (c.name ? [c.name.toLowerCase()] : [])))).size;
  return (
    <section id="lookbook" aria-label={headOf(store)} className="spread relative">
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
          <RunningHead side="left">Astitva · the lookbook</RunningHead>
          <div className="mt-6 md:mt-10">
            <p className="cover-settle caption text-2xl" style={{ ["--delay" as string]: "300ms" }}>
              Your true form
            </p>
            {/* The title runs across the fold on wide screens, like a magazine headline. */}
            <h1
              className="cover-settle lookbook-title relative z-10 mt-1 italic leading-[0.88]"
              data-length={(store.title ?? "Astitva").length > 10 ? "long" : "short"}
              style={{ ["--delay" as string]: "450ms" }}
            >
              {store.title ?? "Astitva"}
            </h1>
            {store.subtitle ? (
              <p className="cover-settle mt-8 max-w-sm text-lg leading-relaxed" style={{ ["--delay" as string]: "600ms" }}>
                {store.subtitle}
              </p>
            ) : null}
          </div>

          {opening ? (
            <figure className="cover-settle mt-12 max-w-sm" style={{ ["--delay" as string]: "750ms" }}>
              <blockquote className="caption text-xl leading-snug">“{firstSentence(opening, 160)}”</blockquote>
              <figcaption className="mt-3 flex items-baseline gap-5">
                {store.noteSignature ? <span className="signature text-4xl">{store.noteSignature}</span> : null}
                <a href="#note" className="link text-sm">
                  Read her note
                </a>
              </figcaption>
            </figure>
          ) : null}

          <div className="cover-settle mt-12 flex flex-wrap items-end justify-between gap-6 text-sm" style={{ ["--delay" as string]: "900ms" }}>
            <p className="text-espresso-soft">
              {pieces.length} {pieces.length === 1 ? "style" : "styles"}
              {colourCount > 1 ? `, in ${colourCount} colours` : ""}
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

export function LookbookContents({ store, pieces, folio = "iii" }: { store: Storefront; pieces: LookbookPiece[]; folio?: string }) {
  return (
    <section id="pieces" aria-labelledby="contents-heading" className="leaf relative scroll-mt-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-12 md:px-12 md:py-28">
        <RunningHead side="left">{headOf(store)}</RunningHead>
        <div className="md:col-span-4">
          <p className="caption text-xl">In this lookbook</p>
          <h2 id="contents-heading" className="mt-1 text-5xl md:text-6xl">
            Contents
          </h2>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-espresso-soft">
            Every style has its number. Turn to it for its colours, sizes and how Krishna would wear it.
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
                  <span className="hidden text-sm text-espresso-soft sm:inline">{gone ? "sold out" : (colourLine(p.colours) ?? p.name)}</span>
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

export function LookbookPage({ store, piece, index }: { store: Storefront; piece: LookbookPiece; index: number }) {
  const flip = index % 2 === 1;
  const gone = piece.onHand <= 0;
  return (
    <article id={piece.slug} aria-labelledby={`${piece.slug}-title`} className="leaf relative scroll-mt-0">
      <div className={`mx-auto grid max-w-7xl items-center gap-10 px-6 pb-20 pt-16 md:min-h-[100svh] md:grid-cols-12 md:gap-8 md:px-12 md:py-16`}>
        <RunningHead side={flip ? "right" : "left"}>{headOf(store)}</RunningHead>

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
              {store.noteSignature ? <figcaption className="signature mt-1 text-2xl">{store.noteSignature}</figcaption> : null}
            </figure>
          ) : null}

          <div className="mt-8">
            <Swatches colours={piece.colours} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            {gone ? (
              <p className="caption text-xl">Sold out for now</p>
            ) : (
              <Price priceMinor={piece.priceMinor} compareAtMinor={piece.compareAtMinor} className="text-lg" />
            )}
            <Link href={pieceHref(piece.slug)} className="link text-sm">
              {gone ? "See the piece" : "Choose colour and size"}
            </Link>
          </div>
        </div>
      </div>
      <Folio side={flip ? "left" : "right"}>{index + 1}</Folio>
    </article>
  );
}

/** Krishna's note, given a page of its own, as in a printed lookbook. */
export function LookbookNote({ store, folio = "iii" }: { store: Storefront; folio?: string }) {
  if (!paragraphs(store.note).length) return null;
  return (
    <section id="note" aria-label="A note from Krishna" className="leaf relative scroll-mt-0 py-20 md:py-28">
      <RunningHead side="left">{headOf(store)}</RunningHead>
      <Letter text={store.note} signature={store.noteSignature} id="note-text" />
      <Folio side="right">{folio}</Folio>
    </section>
  );
}
