import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArchImage } from "@/components/storefront/arch-image";
import { BuyPanel } from "@/components/storefront/buy-panel";
import { Price } from "@/components/storefront/price";
import { db } from "@/db/client";
import type { Measurements } from "@/db/schema";
import { getProductBySlug, type ProductDetail } from "@/modules/catalog/queries";
import { getAvailability } from "@/modules/inventory/service";

const ORDERING_OPEN = false; // flips on with checkout (M3)

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { images: product.images[0] ? [{ url: product.images[0].url }] : undefined },
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

/** Live stock: never cached, streamed in after the product content. */
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
    <div className="mt-8">
      <h2 className="font-sans text-sm font-medium">Garment measurements (cm)</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-espresso-soft">
            <tr className="border-b border-taupe/50">
              {withMeasurements.length > 1 && <th scope="col" className="py-2 pr-4 font-normal">Size</th>}
              {columns.map(([, label]) => (
                <th key={label} scope="col" className="py-2 pr-4 font-normal">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withMeasurements.map((v) => (
              <tr key={v.id} className="border-b border-taupe/30">
                {withMeasurements.length > 1 && <th scope="row" className="py-2 pr-4 font-medium">{v.size ?? "One size"}</th>}
                {columns.map(([key]) => (
                  <td key={key} className="py-2 pr-4">{v.measurements?.[key] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-espresso-soft">
        Measured flat and doubled where relevant. <Link href="/size-guide" className="link">How to measure yourself</Link>
      </p>
    </div>
  );
}

async function ProductView({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.variants.length === 0) notFound();

  const prices = product.variants.map((v) => v.priceMinor);
  const lowest = product.variants.find((v) => v.priceMinor === Math.min(...prices))!;
  const oneOfOne = product.variants.length === 1 && product.sourceType === "curated" && product.variants[0]!.onHand <= 1;
  const condition = product.variants.length === 1 ? product.variants[0]!.condition : null;
  const [hero, ...rest] = product.images;

  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-8 sm:px-8 md:grid-cols-[1.15fr_1fr] md:gap-16 md:pb-16">
      {/* On phones the photo is narrowed so the name and price sit above the fold. */}
      <div className="mx-auto w-4/5 max-w-md md:w-full md:max-w-none">
        <ArchImage src={hero?.url ?? null} alt={hero?.alt || product.name} sizes="(min-width: 768px) 55vw, 100vw" priority />
        {rest.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-4">
            {rest.map((img, i) => (
              <li key={img.url}>
                <ArchImage src={img.url} alt={img.alt || `${product.name}, view ${i + 2}`} sizes="(min-width: 768px) 27vw, 50vw" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="md:sticky md:top-8 md:self-start">
        <nav aria-label="Breadcrumb" className="text-sm text-espresso-soft">
          <Link href="/shop" className="link">The collection</Link>
        </nav>
        <h1 className="mt-4 text-3xl sm:text-4xl">{product.name}</h1>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4">
          <Price
            className="text-xl"
            priceMinor={lowest.priceMinor}
            compareAtMinor={lowest.compareAtMinor}
            from={new Set(prices).size > 1}
          />
          {oneOfOne && <span className="font-accent text-xl italic text-olive">One of one</span>}
        </div>
        <p className="mt-1 text-xs text-espresso-soft">Inclusive of all taxes</p>

        <Suspense fallback={<p className="mt-8 h-24 text-sm text-espresso-soft">Checking availability…</p>}>
          <LiveBuyPanel product={product} />
        </Suspense>

        {product.description && <p className="mt-10 whitespace-pre-line">{product.description}</p>}

        <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
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

        <MeasurementsTable variants={product.variants} />

        <div className="mt-10 border-t border-taupe/40 pt-6 text-sm text-espresso-soft">
          <p>
            Delivery and returns details are on our <Link href="/policies/shipping" className="link">shipping</Link> and{" "}
            <Link href="/policies/returns" className="link">returns</Link> pages.
          </p>
        </div>
      </div>
    </article>
  );
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[70vh] max-w-6xl" aria-busy="true" />}>
      <ProductView params={props.params} />
    </Suspense>
  );
}
