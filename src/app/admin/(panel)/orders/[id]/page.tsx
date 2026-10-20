import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CancelOrder, VerifyButton } from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { db } from "@/db/client";
import { whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { isCancellable } from "@/modules/orders/machines";
import { getOrderForAdmin } from "@/modules/orders/service";

export const metadata: Metadata = { title: "Order" };

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const EVENT_LABEL: Record<string, string> = {
  "order.placed": "Placed by the buyer",
  "cod.verified": "Confirmed with the buyer",
  "order.cancelled": "Cancelled",
};

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getOrderForAdmin(db, id);
  if (!order) notFound();

  const a = order.addressSnapshot;
  const toConfirm = order.paymentMethod === "cod" && order.orderStatus === "confirmed" && !order.codVerifiedAt;
  const firstName = order.contactName.split(/\s+/)[0];
  const itemsText = order.items.map((i) => `${i.name}${[i.variant.color, i.variant.size].some(Boolean) ? ` (${[i.variant.color, i.variant.size].filter(Boolean).join(", ")})` : ""}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join("; ");
  const confirmMessage = `Hello ${firstName}, this is Astitva. Thank you for order ${order.orderNumber}: ${itemsText}. It comes to ${formatINR(order.totalMinor)}, to pay on delivery, and goes to ${a.city} ${a.pincode}. Shall we pack it?`;

  return (
    <div>
      <Link href="/admin/orders" className="link text-sm">
        All orders
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="font-display text-3xl tabular-nums">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.orderStatus} method={order.paymentMethod} verified={order.codVerifiedAt !== null} />
      </div>
      <p className="mt-1 text-sm text-espresso-soft">
        {when.format(order.createdAt)} · {order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"}
      </p>

      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_18rem]">
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-xl">Pieces</h2>
            <ul className="mt-3 divide-y divide-sand border-y border-sand">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{i.name}</span>
                    <span className="block text-espresso-soft">
                      {[i.variant.color, i.variant.size].filter(Boolean).join(" · ")} · {i.sku}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {i.quantity} × {formatINR(i.unitPriceMinor)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-espresso-soft">Subtotal</dt>
                <dd>{formatINR(order.subtotalMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-espresso-soft">Shipping</dt>
                <dd>{order.shippingMinor ? formatINR(order.shippingMinor) : "Free"}</dd>
              </div>
              {order.codFeeMinor ? (
                <div className="flex justify-between">
                  <dt className="text-espresso-soft">COD fee</dt>
                  <dd>{formatINR(order.codFeeMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <dt>{order.paymentMethod === "cod" && order.orderStatus !== "cancelled" ? "To collect" : "Total"}</dt>
                <dd>{formatINR(order.totalMinor)}</dd>
              </div>
            </dl>
          </section>

          <section className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-xl">Buyer</h2>
              <p className="mt-3 text-sm leading-relaxed">
                {order.contactName}
                <br />
                <a href={`tel:+91${order.contactPhone}`} className="link">
                  {formatMobile(order.contactPhone)}
                </a>
                {order.contactEmail ? (
                  <>
                    <br />
                    {order.contactEmail}
                  </>
                ) : null}
              </p>
            </div>
            <div>
              <h2 className="font-display text-xl">Ship to</h2>
              <address className="mt-3 text-sm not-italic leading-relaxed">
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
          </section>

          {order.customerNote ? (
            <section>
              <h2 className="font-display text-xl">Their note</h2>
              <p className="mt-3 whitespace-pre-line text-sm">{order.customerNote}</p>
            </section>
          ) : null}

          <section>
            <h2 className="font-display text-xl">History</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-4">
                  <span className="w-44 shrink-0 whitespace-nowrap text-espresso-soft tabular-nums">{when.format(e.createdAt)}</span>
                  <span>
                    {EVENT_LABEL[e.eventType] ?? e.eventType}
                    {e.eventType === "order.cancelled" && typeof e.metadata?.reason === "string" ? `: ${e.metadata.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          {toConfirm ? (
            <div className="space-y-4 bg-champagne p-5">
              <p className="text-sm">
                <span className="font-medium">Confirm before packing.</span> Message {firstName} on WhatsApp, then mark it confirmed.
              </p>
              <a href={whatsappLink(`91${order.contactPhone}`, confirmMessage)} target="_blank" rel="noopener noreferrer" className="btn-outline w-full">
                Message on WhatsApp
              </a>
              <VerifyButton orderId={order.id} />
            </div>
          ) : order.codVerifiedAt && order.orderStatus !== "cancelled" ? (
            <p className="text-sm text-espresso-soft">Confirmed with the buyer on {when.format(order.codVerifiedAt)}. Packing and shipping arrive in the next update.</p>
          ) : null}
          {order.orderStatus === "cancelled" ? (
            <p className="text-sm text-espresso-soft">Cancelled{order.cancelReason ? `: ${order.cancelReason}` : "."}</p>
          ) : isCancellable(order.orderStatus) ? (
            <CancelOrder orderId={order.id} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
