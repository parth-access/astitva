import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/brand/reveal";
import { OrderSkeleton } from "@/components/lookbook/skeletons";
import { PrintButton } from "@/components/storefront/print-button";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { formatLongDate } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { isOrderLinkKey, orderPath, receiptPath } from "@/modules/orders/links";
import { getOrderForBuyer } from "@/modules/orders/service";
import { getReceipt, paidWithLabel, statusLine } from "@/modules/receipts/service";

export const metadata: Metadata = { title: "Your receipt", robots: { index: false, follow: false } };

/** The receipt as a page: the same as the PDF, and it prints cleanly on A4. */
async function ReceiptView({ params, searchParams }: PageProps<"/orders/[number]/receipt">) {
  const [{ number }, { k }] = await Promise.all([params, searchParams]);
  const key = typeof k === "string" ? k : null;
  const order = await getOrderForBuyer(db, decodeURIComponent(number));
  if (!order || !isOrderLinkKey(order.id, key, env().BETTER_AUTH_SECRET)) notFound();
  const r = await getReceipt(db, order.id);
  if (!r) notFound();

  const o = r.order;
  const a = o.address;
  const s = r.status;
  const label = "font-sans text-[0.7rem] uppercase tracking-[0.2em] text-espresso-soft";
  const facts: [string, string][] =
    s.kind === "paid_online"
      ? [
          ["Paid with", `${paidWithLabel(s.paidWith)}, through Razorpay`],
          ["Paid on", formatLongDate(s.paidAt)],
          ["Payment reference", s.reference],
        ]
      : [["Payment", s.kind === "paid_on_delivery" ? "Cash on delivery, paid to the courier" : "Cash on delivery: cash or UPI to the courier"]];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-8 md:pt-16 print:max-w-none print:p-0">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link href={orderPath(order.orderNumber, key!)} className="link text-sm text-espresso-soft">
          ← Back to your order
        </Link>
        <div className="flex gap-3">
          <PrintButton className="btn-outline">Print</PrintButton>
          <a href={receiptPath(order.orderNumber, key!, "pdf")} className="btn-primary" download>
            Download PDF
          </a>
        </div>
      </div>

      <article className="rounded-3xl border border-taupe/40 bg-[rgb(255_252_245/0.85)] p-6 sm:p-10 print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-taupe/50 pb-6">
          <div>
            <p className="font-display text-3xl tracking-[0.35em]">ASTITVA</p>
            <p className="caption mt-1">Your true form</p>
          </div>
          <div className="text-right">
            <h1 className="text-4xl italic">Receipt</h1>
            <p className="mt-1 font-medium tabular-nums">{r.receiptNumber}</p>
          </div>
          <p className="w-full text-xs text-espresso-soft">Payment receipt, not a tax invoice. Prices include all taxes.</p>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-taupe/30 py-6 sm:grid-cols-4">
          {(
            [
              ["Receipt", r.receiptNumber],
              ["Issued", formatLongDate(r.issuedAt)],
              ["Order", o.orderNumber],
              ["Placed", formatLongDate(new Date(o.placedAt))],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className={label}>{k}</dt>
              <dd className="mt-1 font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-6 border-b border-taupe/30 py-6 text-sm sm:grid-cols-2">
          <div>
            <h2 className={label}>Billed to</h2>
            <p className="mt-2 leading-relaxed">
              {o.buyer.name}
              <br />
              <span className="tabular-nums">{formatMobile(o.buyer.phone)}</span>
              {o.buyer.email ? (
                <>
                  <br />
                  {o.buyer.email}
                </>
              ) : null}
            </p>
          </div>
          <div>
            <h2 className={label}>Delivered to</h2>
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
        </div>

        <table className="mt-6 w-full text-sm tabular-nums">
          <thead>
            <tr className="bg-champagne text-left text-[0.7rem] uppercase tracking-[0.15em]">
              <th scope="col" className="px-3 py-2 font-medium">Piece</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i, n) => (
              <tr key={n} className="border-b border-champagne align-top">
                <td className="px-3 py-3">
                  <span className="font-medium">{i.name}</span>
                  <span className="block text-xs text-espresso-soft">{[i.variant.color, i.variant.size].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="px-3 py-3 text-right">{i.quantity}</td>
                <td className="hidden px-3 py-3 text-right sm:table-cell">{formatINR(i.unitPriceMinor)}</td>
                <td className="px-3 py-3 text-right">{formatINR(i.unitPriceMinor * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-6 max-w-xs space-y-2 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-espresso-soft">Subtotal</dt>
            <dd>{formatINR(o.subtotalMinor)}</dd>
          </div>
          {o.discountMinor ? (
            <div className="flex justify-between text-olive">
              <dt>Discount{o.discountCode ? ` (${o.discountCode})` : ""}</dt>
              <dd>−{formatINR(o.discountMinor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-espresso-soft">Delivery</dt>
            <dd>{o.shippingMinor ? formatINR(o.shippingMinor) : "Free"}</dd>
          </div>
          {o.codFeeMinor ? (
            <div className="flex justify-between">
              <dt className="text-espresso-soft">Cash on delivery fee</dt>
              <dd>{formatINR(o.codFeeMinor)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-taupe/50 pt-3">
            <dt className="font-medium">{s.kind === "due_on_delivery" ? "To pay on delivery" : "Total"}</dt>
            <dd className="font-display text-2xl">{formatINR(r.amountMinor)}</dd>
          </div>
          {r.refunds.map((b, n) => (
            <div key={n} className="flex justify-between text-espresso-soft">
              <dt>{b.status === "succeeded" ? `Refunded, ${formatLongDate(b.at)}` : "Refund on its way"}</dt>
              <dd>−{formatINR(b.amountMinor)}</dd>
            </div>
          ))}
        </dl>

        <section aria-label="Payment" className={`mt-8 border p-5 text-sm ${s.kind === "not_collected" ? "border-burgundy" : "border-taupe/60"}`}>
          <p className={`font-medium ${s.kind === "not_collected" ? "text-burgundy" : ""}`}>{statusLine(r)}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-espresso-soft">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="caption mt-8 text-lg">Thank you for choosing Astitva. Every piece is packed by hand.</p>
        <p className="mt-6 border-t border-taupe/30 pt-4 text-xs text-espresso-soft">
          {[env().APP_URL.replace(/^https?:\/\//, ""), r.shop.email, r.shop.whatsapp ? `WhatsApp +${r.shop.whatsapp}` : null].filter(Boolean).join(" · ")}
        </p>
      </article>
    </div>
  );
}

export default function ReceiptPage(props: PageProps<"/orders/[number]/receipt">) {
  return (
    <Reveal fallback={<OrderSkeleton />}>
      <ReceiptView {...props} />
    </Reveal>
  );
}
