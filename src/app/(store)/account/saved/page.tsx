import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/brand/reveal";
import { AccountShell, AccountSkeleton } from "@/components/storefront/account/account-shell";
import { ProductGrid } from "@/components/storefront/product-grid";
import { db } from "@/db/client";
import { ACROSS } from "@/lib/transition-types";
import { listSavedIds } from "@/modules/account/saved";
import { requireCustomer } from "@/modules/auth/customer";
import { listPieces } from "@/modules/catalog/queries";

export const metadata: Metadata = { title: "Saved pieces", robots: { index: false } };

async function Saved() {
  const { id } = await requireCustomer("/account/saved");
  const [ids, pieces] = await Promise.all([listSavedIds(db, id), listPieces({ limit: 500 })]);
  // Newest saved first. A style no longer offered drops out of the list.
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const saved = ids.map((i) => byId.get(i)).filter((p) => p !== undefined);

  if (saved.length === 0) {
    return (
      <div className="rounded-3xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] px-6 py-12 text-center">
        <p className="font-display text-3xl italic">Nothing saved yet</p>
        <p className="mt-2 text-espresso-soft">Tap the heart on a piece to keep it here, on every device you sign in on.</p>
        <Link href="/shop" transitionTypes={ACROSS} className="btn-outline mt-6">
          Browse the pieces
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <p className="leading-relaxed text-espresso-soft">Pieces you&apos;ve hearted, newest first. Tap a heart again to let one go.</p>
      <ProductGrid pieces={saved} priorityCount={2} />
    </div>
  );
}

export default function SavedPage() {
  return (
    <AccountShell current="saved">
      <Reveal fallback={<AccountSkeleton />}>
        <Saved />
      </Reveal>
    </AccountShell>
  );
}
