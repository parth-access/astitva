import { randomUUID } from "node:crypto";
import { Reveal } from "@/components/brand/reveal";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { db } from "@/db/client";
import { BAG_COOKIE, findBag, readBag } from "@/modules/bag/service";
import { EMPTY_BAG } from "@/modules/bag/types";
import { getConcierge, getStorefront } from "@/modules/catalog/queries";
import { priceOrder } from "@/modules/checkout/pricing";
import { getCheckoutSettings } from "@/modules/checkout/queries";
import { razorpay } from "@/modules/payments/client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

function Quiet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-8">
      <h1 className="text-5xl italic">{title}</h1>
      <div className="mt-6 text-espresso-soft">{children}</div>
    </div>
  );
}

async function Checkout() {
  const [store, settings, concierge] = await Promise.all([getStorefront(), getCheckoutSettings(), getConcierge()]);
  if (!store.orderingOpen) {
    return (
      <Quiet title="Not open yet">
        <p>Ordering opens soon. Until then, the lookbook is all yours.</p>
        <Link href="/" className="btn-outline mt-8">
          Back to the lookbook
        </Link>
      </Quiet>
    );
  }

  const found = await findBag(db, (await cookies()).get(BAG_COOKIE)?.value);
  const bag = found ? await readBag(db, found.id) : EMPTY_BAG;
  if (bag.count === 0) {
    return (
      <Quiet title="Your bag is empty">
        <p>Choose a piece in the colour and size you like, and it will wait here.</p>
        <Link href="/#pieces" className="btn-outline mt-8">
          Open the lookbook
        </Link>
      </Quiet>
    );
  }

  const lines = bag.lines.map((l) => ({ unitPriceMinor: l.priceMinor, quantity: l.quantity }));
  const totals = { cod: priceOrder(lines, settings, "cod"), online: priceOrder(lines, settings, "online") };
  const rzp = razorpay();
  return (
    <CheckoutForm
      bag={bag}
      totals={totals}
      online={rzp ? { testMode: rzp.testMode } : null}
      codEnabled={settings.codEnabled}
      overCodLimit={totals.cod.totalMinor > settings.codMaxOrderMinor}
      holdMinutes={settings.holdMinutes}
      who={concierge.name}
      // One key per visit to this page: a double tap or a resubmit places one order.
      idempotencyKey={randomUUID()}
    />
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-10 sm:px-8 md:grid-cols-12" aria-busy="true" aria-label="Loading checkout">
      <div className="space-y-5 md:col-span-7">
        <div className="skeleton h-12 w-48" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-12 w-full" />
        ))}
      </div>
      <div className="space-y-4 md:col-span-4 md:col-start-9">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Reveal fallback={<CheckoutSkeleton />}>
      <Checkout />
    </Reveal>
  );
}
