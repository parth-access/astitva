import Link from "next/link";
import { Monogram } from "@/components/storefront/monogram";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Monogram className="h-24 w-auto text-gold" />
      <h1 className="mt-8 text-3xl">This page is not here</h1>
      <p className="mt-4 text-espresso-soft">The piece may have been sold or the link may be wrong.</p>
      <Link href="/shop" className="btn-primary mt-8">
        Browse the collection
      </Link>
    </main>
  );
}
