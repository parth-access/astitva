import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listCategories, listProducts, PRODUCT_SORTS, type ProductSort } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Shop",
  description: "Shop the Astitva collection. Many pieces are one of one.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hrefFor(category: string | undefined, sort: ProductSort) {
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (sort !== "newest") qs.set("sort", sort);
  const s = qs.toString();
  return s ? `/shop?${s}` : "/shop";
}

async function Catalogue({ searchParams }: Pick<PageProps<"/shop">, "searchParams">) {
  const params = await searchParams;
  const rawSort = first(params.sort);
  const sort: ProductSort = rawSort && rawSort in PRODUCT_SORTS ? (rawSort as ProductSort) : "newest";
  const category = first(params.category)?.slice(0, 96);

  const [cats, items] = await Promise.all([listCategories(), listProducts({ categorySlug: category, sort })]);
  const active = cats.find((c) => c.slug === category);

  return (
    <>
      <div className="flex flex-col gap-6 border-y border-taupe/40 py-4 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Categories">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href={hrefFor(undefined, sort)} aria-current={!active ? "page" : undefined} className={!active ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}>
                Everything
              </Link>
            </li>
            {cats.map((c) => (
              <li key={c.id}>
                <Link
                  href={hrefFor(c.slug, sort)}
                  aria-current={active?.id === c.id ? "page" : undefined}
                  className={active?.id === c.id ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}
                >
                  {c.name}
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
                  href={hrefFor(active?.slug, s)}
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
      <p className="mb-10 mt-6 text-sm text-espresso-soft" aria-live="polite">
        {items.length === 1 ? "1 piece" : `${items.length} pieces`}
      </p>
      <ProductGrid products={items} priorityCount={2} />
    </>
  );
}

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8">
      <h1 className="mb-8 text-4xl">The collection</h1>
      <Suspense fallback={<div className="h-96" aria-busy="true" />}>
        <Catalogue searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
