import Link from "next/link";
import { ArchImage } from "@/components/storefront/arch-image";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listProducts } from "@/modules/catalog/queries";

export default async function HomePage() {
  const [featured, latest] = await Promise.all([
    listProducts({ featuredOnly: true, limit: 6 }),
    listProducts({ sort: "newest", limit: 6 }),
  ]);
  // Rows of three on desktop: trim so the grid never ends on a lone piece.
  const pool = featured.length >= 3 ? featured : latest;
  const showcase = pool.length >= 6 ? pool.slice(0, 6) : pool.length >= 3 ? pool.slice(0, 3) : pool;
  const isFeatured = pool === featured;

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-end gap-10 px-4 pt-10 sm:px-8 md:grid-cols-[1.1fr_1fr] md:gap-16 md:pt-16">
        <div className="order-2 pb-4 md:order-1 md:pb-16">
          <p className="font-accent text-2xl italic text-espresso-soft">Your true form</p>
          <h1 className="mt-4 text-4xl sm:text-5xl">Clothes chosen one piece at a time, for the woman you already are.</h1>
          <p className="mt-6 max-w-md text-espresso-soft">
            Every Astitva piece is picked by hand. Many exist only once, so when it is gone, it is gone.
          </p>
          <Link href="/shop" className="btn-primary mt-8">
            Shop the collection
          </Link>
        </div>
        <div className="order-1 mx-auto w-4/5 max-w-sm md:order-2 md:w-full md:max-w-none">
          {/* TODO(brand): campaign photograph or the hat illustration from the final brand files. */}
          <ArchImage src={null} alt="" ratio="2/3" sizes="(min-width: 768px) 45vw, 80vw" priority />
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-8" aria-labelledby="new-in">
        <div className="mb-10 flex items-baseline justify-between gap-4">
          <h2 id="new-in" className="text-3xl">
            {isFeatured ? "Chosen for now" : "Just arrived"}
          </h2>
          <Link href="/shop" className="link text-sm">
            See everything
          </Link>
        </div>
        <ProductGrid products={showcase} priorityCount={2} />
      </section>

      <section className="mx-auto mt-36 grid max-w-6xl items-center gap-10 px-4 sm:px-8 md:grid-cols-[1fr_1.2fr] md:gap-20">
        <div className="mx-auto w-3/5 max-w-xs md:w-full">
          <ArchImage src={null} alt="" ratio="3/4" sizes="(min-width: 768px) 35vw, 60vw" />
        </div>
        <div>
          <h2 className="text-3xl">Astitva means existence. Being fully yourself.</h2>
          <p className="mt-5 max-w-prose text-espresso-soft">
            {/* TODO(brand): Krishna's own words for the brand story. */}
            We look for pieces with a quiet confidence: good fabric, a considered cut, something you will reach for again.
            We start with a small curated collection and will grow into clothing we design ourselves.
          </p>
          <Link href="/about" className="link mt-6 inline-block text-sm">
            Our story
          </Link>
        </div>
      </section>
    </>
  );
}
