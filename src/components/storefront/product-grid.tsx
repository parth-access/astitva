import Link from "next/link";
import type { ProductCard } from "@/modules/catalog/queries";
import { ArchImage } from "./arch-image";
import { Price } from "./price";

/**
 * No cards, no shadows: the arch and the type do the work. The grid steps the
 * middle column down on wide screens so a row reads like a window display
 * rather than a spreadsheet.
 */
export function ProductGrid({ products, priorityCount = 0 }: { products: ProductCard[]; priorityCount?: number }) {
  if (products.length === 0) {
    return (
      <p className="py-16 text-espresso-soft">
        Nothing here yet. New pieces arrive in small drops, so check back soon.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12 lg:[&>li:nth-child(3n+2)]:translate-y-12">
      {products.map((p, i) => {
        const soldOut = p.onHand <= 0;
        const oneOfOne = p.variantCount === 1 && p.onHand === 1;
        return (
          <li key={p.id}>
            <Link href={`/products/${p.slug}`} className="group block">
              <div className="relative">
                <ArchImage
                  src={p.imageUrl}
                  alt={p.imageAlt}
                  sizes="(min-width: 1024px) 30vw, 50vw"
                  priority={i < priorityCount}
                  className={`transition-opacity duration-300 group-hover:opacity-90 ${soldOut ? "opacity-60" : ""}`}
                />
                {soldOut && (
                  <span className="absolute bottom-3 left-3 bg-ivory px-2 py-0.5 text-xs text-espresso">Sold</span>
                )}
              </div>
              <h3 className="mt-4 font-display text-lg leading-snug group-hover:text-burgundy">{p.name}</h3>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm">
                <Price priceMinor={p.priceMinor} compareAtMinor={p.compareAtMinor} from={p.variantCount > 1} />
                {oneOfOne && <span className="font-accent text-base italic text-olive">One of one</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
