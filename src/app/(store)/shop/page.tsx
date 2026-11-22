import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { GridSkeleton } from "@/components/lookbook/skeletons";
import { Catalogue } from "@/components/storefront/shop-catalogue";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Shop women's clothing online",
  description: "Every Astitva style in one place, in every colour we have. Choose a colour to see it, and the sizes it comes in. Delivered across India.",
  // Sorting is a view of this one page. Each category has its own (/shop/dresses).
  path: "/shop",
});

export default function ShopPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8">
      <p className="caption text-xl">Every style, every colour</p>
      <h1 className="mb-10 mt-1 text-6xl italic md:text-7xl">The shop</h1>
      <Reveal fallback={<GridSkeleton />}>
        <Catalogue />
      </Reveal>
    </div>
  );
}
