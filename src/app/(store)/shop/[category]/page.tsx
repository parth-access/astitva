import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/brand/reveal";
import { JsonLd } from "@/components/brand/json-ld";
import { pieceHref } from "@/components/brand/piece-caption";
import { GridSkeleton } from "@/components/lookbook/skeletons";
import { Catalogue, shopHref } from "@/components/storefront/shop-catalogue";
import { formatINR } from "@/lib/money";
import { breadcrumbLd, itemListLd, pageMeta } from "@/lib/seo";
import { listCategories, listPieces } from "@/modules/catalog/queries";
import { atLeastOne } from "@/lib/static-params";
import { CATEGORY_INTROS } from "@/content/categories";

export async function generateStaticParams() {
  return atLeastOne("category", (await listCategories()).map((c) => c.slug));
}

async function categoryFor(slug: string) {
  return (await listCategories()).find((c) => c.slug === decodeURIComponent(slug)) ?? null;
}

/** "Sage, ivory and rust". */
function listWords(words: string[]) {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What search shows for a category, from what the page lists: its styles, colours and lowest price. */
export async function generateMetadata({ params }: PageProps<"/shop/[category]">): Promise<Metadata> {
  const category = await categoryFor((await params).category);
  if (!category) return { title: "Not found", robots: { index: false } };
  // What people search for: "women's co-ord sets online".
  const title = `Women's ${category.name.toLowerCase()} online`;
  const canonical = shopHref(category.slug);
  if (category.styles === 0) {
    // Nothing to show yet: kept out of search until it has pieces.
    return { ...pageMeta({ title, description: `Astitva ${category.name.toLowerCase()} are on their way.`, path: canonical }), robots: { index: false, follow: true } };
  }
  const pieces = await listPieces({ categorySlug: category.slug });
  const names = pieces.slice(0, 4).map((p) => p.pieceName ?? p.name);
  const colours = [...new Set(pieces.flatMap((p) => p.colours.flatMap((c) => (c.name ? [c.name.toLowerCase()] : []))))];
  const lowest = Math.min(...pieces.map((p) => p.priceMinor));
  const description = [
    `${pieces.length === 1 ? "One style" : `${pieces.length} styles`} of ${category.name.toLowerCase()} by Astitva${names.length ? `: ${listWords(pieces.length > names.length ? [...names, "more"] : names)}` : ""}.`,
    colours.length > 1 ? `In ${listWords(colours.slice(0, 6))}.` : null,
    Number.isFinite(lowest) ? `From ${formatINR(lowest)}, prices include tax.` : null,
    "Delivered across India.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  return pageMeta({ title, description, path: canonical });
}

async function CategoryView({ params }: Pick<PageProps<"/shop/[category]">, "params">) {
  const { category: slug } = await params;
  const category = await categoryFor(slug);
  if (!category) notFound();
  const pieces = category.styles ? await listPieces({ categorySlug: category.slug }) : [];
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Astitva", path: "/" },
            { name: "Shop", path: "/shop" },
            { name: category.name, path: shopHref(category.slug) },
          ]),
          ...(pieces.length ? [itemListLd(category.name, pieces.map((p) => pieceHref(p.slug)))] : []),
        ]}
      />
      <header className="mb-10">
        <p className="caption text-xl">The shop</p>
        <h1 className="mt-1 text-6xl italic md:text-7xl">{category.name}</h1>
        {CATEGORY_INTROS[category.slug] ? <p className="mt-4 max-w-xl text-espresso-soft">{CATEGORY_INTROS[category.slug]}</p> : null}
      </header>
      <Catalogue category={category.slug} />
    </>
  );
}

export default function CategoryPage(props: PageProps<"/shop/[category]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8">
      <Reveal fallback={<GridSkeleton />}>
        <CategoryView params={props.params} />
      </Reveal>
    </div>
  );
}
