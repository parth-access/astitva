import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { formatLongDate, whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { getConcierge } from "@/modules/catalog/queries";
import { isOrderLinkKey } from "@/modules/orders/links";
import { getOrderForBuyer } from "@/modules/orders/service";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

function Tick() {
  return (
    <svg viewBox="0 0 64 64" className="tick mx-auto block size-16 text-olive" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 33.5l8 8 16-18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
}

async function OrderView({ params, searchParams }: PageProps<"/orders/[number]">) {
  const [{ number }, { k }] = await Promise.all([params, searchParams]);
  const order = await getOrderForBuyer(db, decodeURIComponent(number));
  // Without the private key the page doesn't exist, rather than "forbidden".
  if (!order || !isOrderLinkKey(order.id, typeof k === "string" ? k : null, env().BETTER_AUTH_SECRET)) notFound();

  const concierge = await getConcierge();
  const who = concierge.name ?? "We";
  const firstName = order.contactName.split(/\s+/)[0];
  const cancelled = order.orderStatus === "cancelled";
  const a = order.address;
  const hello = `Hello${concierge.name ? ` ${concierge.name}` : ""}, I've just placed order ${order.orderNumber} (${formatINR(order.totalMinor)}, cash on delivery).`;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-8 md:pt-16">
      <div className="text-center">
        {cancelled ? null : <Tick />}
        <p className="caption mt-6 text-xl">Order {order.orderNumber}</p>
        <h1 className="mt-2 text-5xl italic md:text-6xl">{cancelled ? "This order was cancelled" : `Thank you, ${firstName}.`}</h1>
        {cancelled ? (
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed">If this is a surprise, please message us.</p>
        ) : order.codVerifiedAt ? (
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed">Confirmed. We&apos;re packing it by hand and will send it soon.</p>
        ) : (
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed">
            {who} will message you on WhatsApp at <span className="whitespace-nowrap">{formatMobile(order.contactPhone)}</span> to confirm, then we pack
            it by hand.
          </p>
        )}
        {concierge.whatsapp && !cancelled ? (
          <a href={whatsappLink(concierge.whatsapp, hello)} target="_blank" rel="noopener noreferrer" className="btn-outline mt-8">
            Say hello on WhatsApp
          </a>
        ) : null}
      </div>

      <section aria-label="What you ordered" className="mt-16 border-t border-taupe/40 pt-8">
        <ul className="space-y-4">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-6">
              <span>
                <span className="font-display text-xl italic">{i.name}</span>
                <span className="mt-0.5 block text-sm text-espresso-soft">
                  {[i.variant.color, i.variant.size, i.quantity > 1 ? `${i.quantity} pieces` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="tabular-nums">{formatINR(i.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-taupe/40 pt-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatINR(order.subtotalMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>{order.shippingMinor ? formatINR(order.shippingMinor) : "Free"}</dd>
          </div>
          {order.codFeeMinor ? (
            <div className="flex justify-between">
              <dt>Cash on delivery</dt>
              <dd>{formatINR(order.codFeeMinor)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-taupe/40 pt-3">
            <dt>{cancelled ? "Total" : "To pay on delivery"}</dt>
            <dd className="font-display text-2xl">{formatINR(order.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Delivery" className="mt-12 grid gap-8 border-t border-taupe/40 pt-8 text-sm sm:grid-cols-2">
        <div>
          <h2 className="caption text-lg">Going to</h2>
          <address className="mt-2 not-italic leading-relaxed">
            {a.recipientName}
            <br />
            {a.line1}
            {a.line2 ? (
              <>
                <br />
                {a.line2}
              </>
            ) : null}
            {a.landmark ? (
              <>
                <br />
                Near {a.landmark}
              </>
            ) : null}
            <br />
            {a.city}, {a.state} {a.pincode}
          </address>
        </div>
        <div>
          <h2 className="caption text-lg">Placed</h2>
          <p className="mt-2">{formatLongDate(order.createdAt)}</p>
          {order.contactEmail ? <p className="mt-1 text-espresso-soft">A receipt goes to {order.contactEmail}.</p> : null}
          {order.customerNote ? <p className="mt-4 text-espresso-soft">Your note: {order.customerNote}</p> : null}
        </div>
      </section>

      <p className="mt-16 text-center text-sm text-espresso-soft">
        Keep this page: its address is private to you. <Link href="/" className="link">Back to the lookbook</Link>
      </p>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/orders/[number]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-24"><div className="skeleton mx-auto h-16 w-16 rounded-full" /><div className="skeleton mx-auto mt-8 h-14 w-2/3" /></div>}>
      <OrderView {...props} />
    </Suspense>
  );
}
