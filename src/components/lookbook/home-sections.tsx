import Link from "next/link";
import { Plate } from "@/components/brand/plate";
import { ProductGrid } from "@/components/storefront/product-grid";
import { shopHref } from "@/components/storefront/shop-catalogue";
import { ACROSS } from "@/lib/transition-types";
import type { PieceCard } from "@/modules/catalog/queries";

/**
 * After the contents, the lookbook turns into the shop: every piece at once
 * (colours, price, save), then the kinds of clothes, each opening its own
 * page. They scroll normally and slide over the contents leaf, so each is
 * solid underneath.
 */

export function HomePieces({ pieces }: { pieces: PieceCard[] }) {
  if (pieces.length === 0) return null;
  return (
    <section id="the-pieces" aria-labelledby="the-pieces-heading" className="relative z-10 border-t border-sand bg-ivory">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-20 sm:px-8 md:pt-28">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 lg:mb-16">
          <div>
            <p className="caption text-xl">This season</p>
            <h2 id="the-pieces-heading" className="mt-1 text-5xl italic md:text-6xl">
              The pieces
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-espresso-soft">
            Choose a colour to see it. Open a piece for its sizes, measurements and how we&apos;d wear it.
          </p>
        </div>
        <ProductGrid pieces={pieces} />
      </div>
    </section>
  );
}

export function HomeCategories({
  categories,
  pieces,
}: {
  categories: { id: string; name: string; slug: string; styles: number }[];
  pieces: PieceCard[];
}) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-heading" className="relative z-10 border-t border-sand bg-ivory">
      <div className="bg-sand/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 md:py-28">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="caption text-xl">Shop by kind</p>
              <h2 id="categories-heading" className="mt-1 text-5xl italic md:text-6xl">
                Categories
              </h2>
            </div>
            <Link href="/shop" transitionTypes={ACROSS} className="link text-sm">
              See everything in the shop
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 lg:grid-cols-4">
            {categories.map((c, i) => {
              // The first piece in it lends the tile its colour, or its photograph once there is one.
              const inIt = pieces.filter((p) => p.categorySlug === c.slug);
              const photo = inIt.find((p) => p.imageUrl)?.imageUrl ?? null;
              return (
                <li key={c.id}>
                  <Link href={shopHref(c.slug)} transitionTypes={ACROSS} className="group block">
                    <div className={`transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:-translate-y-1 ${c.styles ? "" : "opacity-80"}`}>
                      {/* The number only varies the sketch's watercolour; it isn't shown. */}
                      <Plate src={photo} alt={c.name.toLowerCase()} tone={inIt[0]?.tone ?? null} category={c.slug} pieceNumber={i + 1} sizes="(min-width: 1024px) 22vw, 46vw" />
                    </div>
                    <h3 className="mt-5 font-display text-2xl italic group-hover:text-burgundy md:text-3xl">{c.name}</h3>
                    <p className="mt-1 text-sm text-espresso-soft">{c.styles === 0 ? "Coming soon" : c.styles === 1 ? "One style" : `${c.styles} styles`}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
