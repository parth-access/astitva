import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { PageTransition } from "@/components/brand/transitions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AskAboutPiece } from "@/components/brand/concierge";
import { PieceCaption, pieceHref } from "@/components/brand/piece-caption";
import { Track } from "@/components/storefront/analytics";
import { BuyPanel } from "@/components/storefront/buy-panel";
import { PieceGallery } from "@/components/storefront/piece-gallery";
import { PieceSelection } from "@/components/storefront/piece-selection";
import { HeartButton } from "@/components/storefront/saved/saved-context";
import { ShopCard } from "@/components/storefront/shop-card";
import { Price } from "@/components/storefront/price";
import { PACKED_BY_HAND, showPromise } from "@/content/brand";
import { db } from "@/db/client";
import type { Measurements } from "@/db/schema";
import { formatPieceNumber } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { gaItem, gaRupees } from "@/lib/analytics";
import { breadcrumbLd, productLd } from "@/lib/seo";
import { JsonLd } from "@/components/brand/json-ld";
import { OptionsSkeleton, PieceSkeleton } from "@/components/lookbook/skeletons";
import { getAdjacentPieces, getProductBySlug, getStorefront, listCategories, listPieces, listRelatedPieces, type ProductDetail } from "@/modules/catalog/queries";
import { getAvailability } from "@/modules/inventory/service";

export async function generateStaticParams() {
  const pieces = await listPieces({ limit: 500 });
  return pieces.map((p) => ({ slug: p.slug }));
}

/** "Sage, Ivory, Rust and Ink". */
function listWords(words: string[]) {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What a search result or a shared link says about a piece, from what the page shows. */
function describe(p: ProductDetail) {
  const colours = [...new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];
  const sizes = [...new Set(p.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
  const lowest = Math.min(...p.variants.map((v) => v.priceMinor));
  const facts = [
    colours.length ? `In ${listWords(colours)}.` : null,
    sizes.length ? `${sizes.length > 1 ? "Sizes" : "Size"} ${listWords(sizes)}.` : null,
    p.material ? `${p.material}.` : null,
    `${formatINR(lowest)}.`,
  ].filter(Boolean);
  const lead = p.seoDescription ?? p.story ?? p.description.split(/\n/)[0] ?? "";
  return { colours, text: `${lead ? `${lead.trim()} ` : ""}${facts.join(" ")}`.slice(0, 300) };
}

export async function generateMetadata({ params }: PageProps<"/pieces/[slug]">): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product || product.variants.length === 0) return { title: "Not found", robots: { index: false } };
  const { colours, text } = describe(product);
  // e.g. "Neem linen wrap dress in Sage, Ivory, Rust and Ink"; the brand is added by the template.
  const named = product.pieceName ? `${product.pieceName} ${product.name.toLowerCase()}` : product.name;
  const title = product.seoTitle ?? (colours.length > 1 && named.length < 40 ? `${named} in ${listWords(colours)}` : named);
  return {
    title,
    description: text,
    alternates: { canonical: pieceHref(product.slug) },
    openGraph: {
      title: `${title} | Astitva`,
      description: text,
      url: pieceHref(product.slug),
      images: [{ url: `${pieceHref(product.slug)}/share.png`, width: 1200, height: 630, alt: `${title}, by Astitva` }],
    },
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
async function LiveBuyPanel({ product, orderingOpen }: { product: ProductDetail; orderingOpen: boolean }) {
  await connection();
  const available = await getAvailability(db, product.variants.map((v) => v.id));
  return (
    <BuyPanel
      orderingOpen={orderingOpen}
      sizeGuide={<MeasurementsTable variants={product.variants} />}
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
  // Measurements belong to a size; every colour of that size shares them.
  const bySize = new Map<string, ProductDetail["variants"][number]>();
  for (const v of variants) if (v.measurements && Object.keys(v.measurements).length > 0 && !bySize.has(v.size ?? "")) bySize.set(v.size ?? "", v);
  const withMeasurements = [...bySize.values()];
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

/** Other pieces from its category, topped up from the next ones (see modules/catalog/related). */
async function YouMightAlsoLike({ productId, categorySlug }: { productId: string; categorySlug: string | null }) {
  const pieces = await listRelatedPieces(productId, categorySlug);
  if (pieces.length === 0) return null;
  return (
    <section aria-labelledby="also-like" className="mx-auto mt-28 max-w-6xl px-4 sm:px-8 md:mt-40">
      <p className="caption text-xl">From the collection</p>
      <h2 id="also-like" className="mt-1 text-4xl italic md:text-5xl">
        You might also like
      </h2>
      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 lg:grid-cols-4">
        {pieces.map((p) => (
          <li key={p.id}>
            <ShopCard piece={p} caption={<PieceCaption piece={p} size="grid" showStory={false} />} />
          </li>
        ))}
      </ul>
    </section>
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
  const [product, store, categories] = await Promise.all([getProductBySlug(slug), getStorefront(), listCategories()]);
  if (!product || product.variants.length === 0) notFound();
  const category = categories.find((c) => c.slug === product.categorySlug) ?? null;

  const prices = product.variants.map((v) => v.priceMinor);
  const lowest = product.variants.find((v) => v.priceMinor === Math.min(...prices))!;
  const condition = product.variants[0]!.condition;
  const title = product.pieceName ?? product.name;
  // The colours this piece comes in, in the order they were added, with their swatches.
  const colours: { name: string | null; hex: string | null }[] = [];
  for (const v of product.variants) if (!colours.some((c) => c.name === v.color)) colours.push({ name: v.color, hex: v.colorHex });
  const firstInStock = product.variants.find((v) => v.onHand > 0)?.color ?? colours[0]?.name ?? null;
  const ld = [
    breadcrumbLd([
      { name: "Astitva", path: "/" },
      { name: "Shop", path: "/shop" },
      ...(category ? [{ name: category.name, path: `/shop/${category.slug}` }] : []),
      { name: title, path: pieceHref(product.slug) },
    ]),
    // Offers only once ordering is open: before that nothing can be bought.
    ...(store.orderingOpen
      ? [
          productLd({
            slug: product.slug,
            name: product.name,
            pieceName: product.pieceName,
            pieceNumber: product.pieceNumber,
            description: describe(product).text,
            material: product.material,
            category: product.categorySlug,
            images: product.images.map((i) => ({ url: i.url, color: i.color })),
            variants: product.variants.map((v) => ({ sku: v.sku, size: v.size, color: v.color, priceMinor: v.priceMinor, condition: v.condition, available: v.onHand })),
          }),
        ]
      : []),
  ];

  return (
    // Its own transition too: going from one piece to the next stays inside this route's template.
    <PageTransition>
      <PieceSelection colours={colours} initialColour={firstInStock}>
        <JsonLd data={ld} />
        <Track
          event="view_item"
          params={{
            currency: "INR",
            value: gaRupees(lowest.priceMinor),
            items: [gaItem({ slug: product.slug, name: title, category: product.categorySlug, priceMinor: lowest.priceMinor })],
          }}
        />
        <article className="mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-6 sm:px-8 md:grid-cols-12 md:gap-8 md:pb-0 md:pt-10">
          {/* On phones the arch is narrowed so the piece's name shows without scrolling. */}
          <div className="mx-auto w-[84%] md:col-span-7 md:w-full">
            <PieceGallery
              slug={product.slug}
              title={title}
              name={product.name}
              tone={product.tone}
              pieceNumber={product.pieceNumber}
              pieceName={product.pieceName}
              category={product.categorySlug}
              images={product.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color }))}
              spinVideo={product.spinVideoUrl}
            />
          </div>

          <div className="md:sticky md:top-8 md:col-span-4 md:col-start-9 md:self-start">
            <Link href="/#the-pieces" transitionTypes={["nav-back"]} className="caption link text-lg no-underline hover:underline">
              {store.title ? `${store.title}, the lookbook` : "The lookbook"}
            </Link>

            {product.pieceNumber ? (
              <p className="mt-5 font-display text-2xl tabular-nums text-espresso-soft md:mt-8">{formatPieceNumber(product.pieceNumber)}</p>
            ) : null}
            <h1 className="mt-1 text-6xl italic leading-none md:text-7xl">{title}</h1>
            {product.pieceName ? <p className="mt-4 text-sm text-espresso-soft">{product.name}</p> : null}

            <div className="mt-6 flex flex-wrap items-baseline gap-x-4">
              <Price className="text-xl" priceMinor={lowest.priceMinor} compareAtMinor={lowest.compareAtMinor} from={new Set(prices).size > 1} />
            </div>
            <p className="mt-1 text-xs text-espresso-soft">Inclusive of all taxes</p>

            {product.story ? <p className="caption mt-8 text-xl">{product.story}</p> : null}

            <Suspense fallback={<OptionsSkeleton />}>
              <LiveBuyPanel product={product} orderingOpen={store.orderingOpen} />
            </Suspense>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
              <AskAboutPiece piece={product} withSelection className="inline-block text-sm" />
              <HeartButton productId={product.id} name={title} variant="inline" />
            </div>

            <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-taupe/30 pt-6 text-sm">
              {category && (
                <>
                  <dt className="text-espresso-soft">In</dt>
                  <dd>
                    <Link href={`/shop/${category.slug}`} className="link">
                      {category.name}
                    </Link>
                  </dd>
                </>
              )}
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
            <p className="caption text-xl">How we&apos;d wear it</p>
            <blockquote className="mt-4 font-display text-3xl italic leading-snug md:text-4xl">{product.stylingNote}</blockquote>
            <p className="mt-6 font-accent text-2xl italic">Team Astitva</p>
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
                  {product.pieceNumber ? ` Its card will read ${formatPieceNumber(product.pieceNumber)}, ${title}.` : ""}
                </p>
              </div>
            ) : null}
            <p className="mt-8 text-sm text-espresso-soft">
              Delivery and returns are explained on our <Link href="/policies/shipping" className="link">shipping</Link> and{" "}
              <Link href="/policies/returns" className="link">returns</Link> pages.
            </p>
          </div>
        </div>

        <YouMightAlsoLike productId={product.id} categorySlug={product.categorySlug} />

        {product.pieceNumber ? <Neighbours pieceNumber={product.pieceNumber} /> : null}
      </PieceSelection>
    </PageTransition>
  );
}

export default function PiecePage(props: PageProps<"/pieces/[slug]">) {
  return (
    <Reveal fallback={<PieceSkeleton />}>
      <PieceView params={props.params} />
    </Reveal>
  );
}
