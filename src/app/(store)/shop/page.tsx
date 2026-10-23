import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { GridSkeleton } from "@/components/lookbook/skeletons";
import { Catalogue, sortFrom } from "@/components/storefront/shop-catalogue";

export const metadata: Metadata = {
  title: "Shop womenswear",
  description: "Every Astitva style in one place, in every colour we have. Choose a colour to see it, and the sizes it comes in.",
  // Sorting is a view of this one page. Each category has its own (/shop/dresses).
  alternates: { canonical: "/shop" },
};

async function Everything({ searchParams }: Pick<PageProps<"/shop">, "searchParams">) {
  return <Catalogue sort={sortFrom((await searchParams).sort)} />;
}

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8">
      <p className="caption text-xl">Every style, every colour</p>
      <h1 className="mb-10 mt-1 text-6xl italic md:text-7xl">The shop</h1>
      <Reveal fallback={<GridSkeleton />}>
        <Everything searchParams={props.searchParams} />
      </Reveal>
    </div>
  );
}
