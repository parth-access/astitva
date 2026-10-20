import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AskAboutPiece } from "@/components/brand/concierge";
import { pieceHref } from "@/components/brand/piece-caption";
import { pieceTransitionName, Plate } from "@/components/brand/plate";
import { BuyPanel } from "@/components/storefront/buy-panel";
import { Price } from "@/components/storefront/price";
import { PACKED_BY_HAND, showPromise } from "@/content/brand";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { db } from "@/db/client";
import type { Measurements } from "@/db/schema";
import { formatPieceNumber, toRoman } from "@/lib/format";
import { getAdjacentPieces, getProductBySlug, listPieces, type ProductDetail } from "@/modules/catalog/queries";
import { getAvailability } from "@/modules/inventory/service";

const ORDERING_OPEN = false; // flips on with checkout (M3)

export async function generateStaticParams() {
  const pieces = await listPieces({ limit: 500 });
  return pieces.map((p) => ({ slug: p.slug }));
}

function titleOf(p: Pick<ProductDetail, "pieceName" | "name" | "pieceNumber">) {
  const name = p.pieceName ? `${p.pieceName}, ${p.name.toLowerCase()}` : p.name;
  return p.pieceNumber ? `${formatPieceNumber(p.pieceNumber)} ${name}` : name;
}

export async function generateMetadata({ params }: PageProps<"/pieces/[slug]">): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.seoTitle ?? titleOf(product),
    description: product.seoDescription ?? product.story?.slice(0, 160) ?? product.description.slice(0, 160),
    alternates: { canonical: pieceHref(product.slug) },
    openGraph: { images: product.images[0] ? [{ url: cloudinaryUrl(product.images[0].url, { width: 1200 }) }] : undefined },
  };
}

const CONDITION_LABEL: Record<string, string> = {
  new_with_tags: "New, with tags",
  new: "New",
  like_new: "Like new",
  gently_used: "Gently used",
};

const MEASUREMENT_LABEL: [keyof Measurements, string][] = [
  ["bustCm", "Bust"],
  ["waistCm", "Waist"],
  ["hipCm", "Hip"],
  ["shoulderCm", "Shoulder"],
  ["sleeveCm", "Sleeve"],
  ["lengthCm", "Length"],
];

/** Live stock: never cached, streamed in after the piece's content. */
async function LiveBuyPanel({ product }: { product: ProductDetail }) {
  await connection();
  const available = await getAvailability(db, product.variants.map((v) => v.id));
  return (
    <BuyPanel
      orderingOpen={ORDERING_OPEN}
      variants={product.variants.map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        priceMinor: v.priceMinor,
        compareAtMinor: v.compareAtMinor,
        available: available.get(v.id) ?? 0,
      }))}
    />
  );
}

function MeasurementsTable({ variants }: { variants: ProductDetail["variants"] }) {
  const withMeasurements = variants.filter((v) => v.measurements && Object.keys(v.measurements).length > 0);
  if (withMeasurements.length === 0) return null;
  const columns = MEASUREMENT_LABEL.filter(([key]) => withMeasurements.some((v) => v.measurements?.[key] != null));
  return (
    <div>
      <h2 className="text-3xl">Measurements</h2>
      <p className="caption mt-2">Taken from the garment itself, in centimetres.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-espresso-soft">
            <tr className="border-b border-taupe/50">
              {withMeasurements.length > 1 && <th scope="col" className="py-2.5 pr-4 font-normal">Size</th>}
              {columns.map(([, label]) => (
                <th key={label} scope="col" className="py-2.5 pr-4 font-normal">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withMeasurements.map((v) => (
              <tr key={v.id} className="border-b border-taupe/30">
                {withMeasurements.length > 1 && <th scope="row" className="py-2.5 pr-4 font-medium">{v.size ?? "One size"}</th>}
                {columns.map(([key]) => (
                  <td key={key} className="py-2.5 pr-4">{v.measurements?.[key] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-espresso-soft">
        Measured flat and doubled where relevant. <Link href="/size-guide" className="link">How to measure yourself</Link>
      </p>
    </div>
  );
}

async function Neighbours({ pieceNumber }: { pieceNumber: number }) {
  const { prev, next } = await getAdjacentPieces(pieceNumber);
  if (!prev && !next) return null;
  return (
    <nav aria-label="Other pieces" className="mx-auto mt-28 grid max-w-6xl grid-cols-2 gap-6 border-t border-taupe/30 px-4 pt-8 sm:px-8">
      <div>
        {prev ? (
          <Link href={pieceHref(prev.slug)} transitionTypes={["nav-back"]} className="group block">
            <span className="text-xs text-espresso-soft">Previous piece</span>
            <span className="mt-1 block font-display text-2xl italic group-hover:text-burgundy">
              {prev.pieceNumber ? `${formatPieceNumber(prev.pieceNumber)} ` : ""}
              {prev.pieceName ?? prev.name}
            </span>
          </Link>
        ) : null}
      </div>
      <div className="text-right">
        {next ? (
          <Link href={pieceHref(next.slug)} transitionTypes={["nav-forward"]} className="group block">
            <span className="text-xs text-espresso-soft">Next piece</span>
            <span className="mt-1 block font-display text-2xl italic group-hover:text-burgundy">
              {next.pieceNumber ? `${formatPieceNumber(next.pieceNumber)} ` : ""}
              {next.pieceName ?? next.name}
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

async function PieceView({ params }: Pick<PageProps<"/pieces/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.variants.length === 0) notFound();

  const prices = product.variants.map((v) => v.priceMinor);
  const lowest = product.variants.find((v) => v.priceMinor === Math.min(...prices))!;
  const single = product.variants.length === 1;
  const oneOfOne = single && product.variants[0]!.onHand <= 1;
  const condition = single ? product.variants[0]!.condition : null;
  const [hero, ...rest] = product.images;
  const title = product.pieceName ?? product.name;
  const signature = product.chapter?.letterSignature;

  return (
    <>
      <article className="mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-6 sm:px-8 md:grid-cols-12 md:gap-8 md:pb-0 md:pt-10">
        {/* On phones the arch is narrowed so the piece's name shows without scrolling. */}
        <div className="mx-auto w-[84%] md:col-span-7 md:w-full">
          <Plate
            transitionName={pieceTransitionName(product.slug)}
            src={hero?.url ?? null}
            alt={hero?.alt || `${title}, ${product.name}`}
            tone={product.tone}
            pieceNumber={product.pieceNumber}
            pieceName={product.pieceName}
            category={product.categorySlug}
            sketchNote
            sizes="(min-width: 768px) 56vw, 92vw"
            priority
          />
          {rest.length > 0 && (
            <ul className="mt-6 grid grid-cols-2 gap-6">
              {rest.map((img, i) => (
                <li key={img.url}>
                  <Plate src={img.url} alt={img.alt || `${title}, view ${i + 2}`} tone={product.tone} sizes="(min-width: 768px) 27vw, 46vw" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:sticky md:top-8 md:col-span-4 md:col-start-9 md:self-start">
          {product.chapter ? (
            <Link href={`/chapters/${product.chapter.slug}#pieces`} transitionTypes={["nav-back"]} className="caption link text-lg no-underline hover:underline">
              Chapter {toRoman(product.chapter.number)}, {product.chapter.title}
            </Link>
          ) : (
            <Link href="/shop" className="caption link text-lg no-underline hover:underline">
              All pieces
            </Link>
          )}

          {product.pieceNumber ? (
            <p className="mt-5 font-display text-2xl tabular-nums text-espresso-soft md:mt-8">{formatPieceNumber(product.pieceNumber)}</p>
          ) : null}
          <h1 className="mt-1 text-6xl italic leading-none md:text-7xl">{title}</h1>
          {product.pieceName ? <p className="mt-4 text-sm text-espresso-soft">{product.name}</p> : null}

          <div className="mt-6 flex flex-wrap items-baseline gap-x-4">
            <Price className="text-xl" priceMinor={lowest.priceMinor} compareAtMinor={lowest.compareAtMinor} from={new Set(prices).size > 1} />
            {oneOfOne && <span className="font-accent text-xl italic text-olive">One of one</span>}
          </div>
          <p className="mt-1 text-xs text-espresso-soft">Inclusive of all taxes</p>

          {product.story ? <p className="caption mt-8 text-xl">{product.story}</p> : null}

          <Suspense fallback={<p className="mt-8 h-24 text-sm text-espresso-soft">Checking availability…</p>}>
            <LiveBuyPanel product={product} />
          </Suspense>

          <AskAboutPiece piece={product} className="mt-6 inline-block text-sm" />

          <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-taupe/30 pt-6 text-sm">
            {condition && (
              <>
                <dt className="text-espresso-soft">Condition</dt>
                <dd>{CONDITION_LABEL[condition]}</dd>
              </>
            )}
            {product.material && (
              <>
                <dt className="text-espresso-soft">Fabric</dt>
                <dd>{product.material}</dd>
              </>
            )}
            {product.fit && (
              <>
                <dt className="text-espresso-soft">Fit</dt>
                <dd>{product.fit}</dd>
              </>
            )}
            {product.careInstructions && (
              <>
                <dt className="text-espresso-soft">Care</dt>
                <dd>{product.careInstructions}</dd>
              </>
            )}
          </dl>
          {product.description ? <p className="mt-6 whitespace-pre-line text-sm leading-relaxed">{product.description}</p> : null}
        </div>
      </article>

      {product.stylingNote ? (
        <section aria-label="How to wear it" className="mx-auto mt-28 max-w-3xl px-4 text-center sm:px-8 md:mt-40">
          <p className="caption text-xl">How {signature ?? "we"} would wear it</p>
          <blockquote className="mt-4 font-display text-3xl italic leading-snug md:text-4xl">{product.stylingNote}</blockquote>
          {signature ? <p className="mt-6 font-accent text-2xl italic">{signature}</p> : null}
        </section>
      ) : null}

      <div className="mx-auto mt-28 grid max-w-6xl gap-16 px-4 sm:px-8 md:mt-40 md:grid-cols-12">
        <div className="md:col-span-6">
          <MeasurementsTable variants={product.variants} />
        </div>
        <div className="md:col-span-4 md:col-start-9">
          {showPromise(PACKED_BY_HAND) ? (
            <div>
              <h2 className="text-3xl">{PACKED_BY_HAND.title}</h2>
              <p className="mt-4 leading-relaxed">
                {PACKED_BY_HAND.body}
                {product.pieceNumber ? ` This one's card will read ${formatPieceNumber(product.pieceNumber)}, ${title}.` : ""}
              </p>
            </div>
          ) : null}
          <p className="mt-8 text-sm text-espresso-soft">
            Delivery and returns are explained on our <Link href="/policies/shipping" className="link">shipping</Link> and{" "}
            <Link href="/policies/returns" className="link">returns</Link> pages.
          </p>
        </div>
      </div>

      {product.pieceNumber ? <Neighbours pieceNumber={product.pieceNumber} /> : null}
    </>
  );
}

export default function PiecePage(props: PageProps<"/pieces/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[80vh] max-w-6xl" aria-busy="true" />}>
      <PieceView params={props.params} />
    </Suspense>
  );
}
