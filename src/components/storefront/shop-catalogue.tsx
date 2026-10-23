import Link from "next/link";
import { garmentKind, SketchPlate } from "@/components/lookbook/sketch-plate";
import { ACROSS } from "@/lib/transition-types";
import { listCategories, listPieces, PRODUCT_SORTS, type ProductSort } from "@/modules/catalog/queries";
import { ProductGrid } from "./product-grid";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** A category has its own page (/shop/dresses); sorting is a view of it. */
export function shopHref(category: string | undefined, sort: ProductSort = "sequence") {
  return `/shop${category ? `/${encodeURIComponent(category)}` : ""}${sort !== "sequence" ? `?sort=${sort}` : ""}`;
}

export function sortFrom(value: string | string[] | undefined): ProductSort {
  const raw = first(value);
  return raw && raw in PRODUCT_SORTS ? (raw as ProductSort) : "sequence";
}

/** The shop's grid, for everything or one category (already checked to exist), with the category and sort links above. */
export async function Catalogue({ category, sort }: { category?: string; sort: ProductSort }) {
  const [cats, items] = await Promise.all([listCategories(), listPieces({ categorySlug: category, sort })]);
  const active = cats.find((c) => c.slug === category);

  return (
    <>
      <div className="flex flex-col gap-6 border-y border-taupe/40 py-4 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Categories">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href={shopHref(undefined, sort)} aria-current={!active ? "page" : undefined} className={!active ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}>
                Everything
              </Link>
            </li>
            {cats.map((c) => (
              <li key={c.id}>
                <Link
                  href={shopHref(c.slug, sort)}
                  aria-current={active?.id === c.id ? "page" : undefined}
                  className={active?.id === c.id ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}
                >
                  {c.name}
                  {c.styles === 0 ? <span className="ml-1.5 inline-block align-super text-[0.65rem] uppercase tracking-[0.14em] text-espresso-soft">soon</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Sort" className="flex items-center gap-3 text-sm">
          <span className="text-espresso-soft">Sort</span>
          <ul className="flex gap-4">
            {(Object.keys(PRODUCT_SORTS) as ProductSort[]).map((s) => (
              <li key={s}>
                <Link
                  href={shopHref(active?.slug, s)}
                  aria-current={s === sort ? "true" : undefined}
                  className={s === sort ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}
                >
                  {PRODUCT_SORTS[s]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className={`mb-10 mt-6 text-sm text-espresso-soft ${active && active.styles === 0 ? "sr-only" : ""}`} aria-live="polite">
        {items.length === 1 ? "One style" : `${items.length} styles`}
        {(() => {
          const n = new Set(items.flatMap((p) => p.colours.flatMap((c) => (c.name ? [c.name.toLowerCase()] : [])))).size;
          return n > 1 ? `, in ${n} colours` : "";
        })()}
      </p>
      {active && active.styles === 0 ? <ComingSoon name={active.name} slug={active.slug} /> : <ProductGrid pieces={items} priorityCount={2} />}
    </>
  );
}

/** A category with nothing in it yet: its garment, sketched, and a way back to everything. */
function ComingSoon({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="mx-auto grid max-w-3xl items-center gap-10 py-6 sm:grid-cols-[14rem_1fr]">
      <div className="arch paper-plate relative mx-auto w-48 sm:w-full" style={{ aspectRatio: "4/5" }}>
        <div className="absolute inset-x-[8%] bottom-[4%] top-[10%]">
          <SketchPlate kind={garmentKind(slug)} tone={null} label={`Sketch of ${name.toLowerCase()} to come`} seed={3} />
        </div>
      </div>
      <div className="text-center sm:text-left">
        <p className="caption text-xl">Coming soon</p>
        <h2 className="mt-1 text-4xl italic md:text-5xl">{name}, on their way</h2>
        <p className="mt-4 leading-relaxed text-espresso-soft">We&apos;re choosing these now, a few at a time. Until they arrive, the rest of the collection is here.</p>
        <Link href="/shop" transitionTypes={ACROSS} className="btn-outline mt-7">
          See everything
        </Link>
      </div>
    </div>
  );
}
