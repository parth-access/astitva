import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  CancelOrder,
  DeliveredButton,
  PackButton,
  RefundForm,
  RemittedForm,
  ResolveForm,
  ReturnedForm,
  ShipForm,
  UnpackButton,
  VerifyButton,
} from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { db } from "@/db/client";
import { whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { isCancellable } from "@/modules/orders/machines";
import { packingBlocker } from "@/modules/orders/fulfilment";
import { getOrderForAdmin } from "@/modules/orders/service";
import { razorpay } from "@/modules/payments/client";
import { refundableMinor } from "@/modules/payments/refunds";

export const metadata: Metadata = { title: "Order" };

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const EVENT_LABEL: Record<string, string> = {
  "order.placed": "Placed by the buyer",
  "cod.verified": "Confirmed with the buyer",
  "order.cancelled": "Cancelled",
  "order.awaiting_payment": "Checkout started, waiting for payment",
  "order.superseded": "Replaced by a new checkout from the same bag",
  "payment.captured": "Payment received",
  "order.needs_resolution": "Needs you",
  "order.packed": "Packed",
  "order.unpacked": "Unpacked",
  "order.shipped": "Handed to the courier",
  "order.delivered": "Delivered",
  "order.returned": "Came back undelivered",
  "cod.remitted": "Courier paid over the cash",
  "order.resolved": "Sorted",
  "refund.succeeded": "Refunded",
  "refund.failed": "Refund failed",
};

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { role } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getOrderForAdmin(db, id);
  if (!order) notFound();

  const a = order.addressSnapshot;
  const toConfirm = order.paymentMethod === "cod" && order.orderStatus === "confirmed" && !order.codVerifiedAt;
  const canSend = (order.orderStatus === "confirmed" || order.orderStatus === "packed") && packingBlocker(order) === null;
  const awaitingRemittance = order.paymentMethod === "cod" && order.orderStatus === "delivered" && order.cod?.status === "collected_by_courier";
  const refundable = await refundableMinor(db, order.id);
  const canRazorpayRefund = order.payment?.status === "captured" && razorpay() !== null;
  const isOwner = role === "owner";
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
        <OrderStatusBadge status={order.orderStatus} method={order.paymentMethod} verified={order.codVerifiedAt !== null} needsResolution={order.needsResolution} />
      </div>
      <p className="mt-1 text-sm text-espresso-soft">
        {when.format(order.createdAt)} ·{" "}
        {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentStatus === "unpaid" ? "Online, not paid" : "Paid online"}
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
                <dt>
                  {order.paymentMethod === "cod" && order.orderStatus !== "cancelled" && order.orderStatus !== "returned"
                    ? order.paymentStatus === "unpaid"
                      ? "To collect"
                      : "Collected"
                    : "Total"}
                </dt>
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
                    {(e.eventType === "order.cancelled" || e.eventType === "order.returned") && typeof e.metadata?.reason === "string" ? `: ${e.metadata.reason}` : ""}
                    {e.eventType.startsWith("refund.") && typeof e.metadata?.amountMinor === "number" ? ` ${formatINR(e.metadata.amountMinor)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-8">
          {order.needsResolution ? (
            <div className="space-y-3 border-l-2 border-burgundy bg-champagne p-5 text-sm">
              <p className="font-medium">Needs you</p>
              <p className="whitespace-pre-line">{order.resolutionNote}</p>
              <p className="text-espresso-soft">Message the buyer to offer another colour or size, or refund them below.</p>
              <ResolveForm orderId={order.id} />
            </div>
          ) : null}

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
          ) : null}

          {canSend ? (
            <section className="space-y-4">
              <h2 className="font-display text-xl">{order.orderStatus === "packed" ? "Packed. Send it" : "Pack and send"}</h2>
              {order.codVerifiedAt ? <p className="text-xs text-espresso-soft">Confirmed with the buyer {when.format(order.codVerifiedAt)}.</p> : null}
              {order.orderStatus === "confirmed" ? <PackButton orderId={order.id} /> : null}
              <ShipForm orderId={order.id} />
              {order.orderStatus === "packed" ? <UnpackButton orderId={order.id} /> : null}
            </section>
          ) : null}

          {order.shipment ? (
            <section className="space-y-3 text-sm">
              <h2 className="font-display text-xl">Parcel</h2>
              <p>
                {order.shipment.carrierName} · <span className="font-mono text-xs">{order.shipment.trackingNumber}</span>
                {order.shipment.trackingUrl ? (
                  <>
                    {" "}
                    <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="link">
                      Track
                    </a>
                  </>
                ) : null}
              </p>
              <p className="text-espresso-soft">
                Sent {when.format(order.shipment.shippedAt)}
                {order.shipment.deliveredAt ? ` · delivered ${when.format(order.shipment.deliveredAt)}` : ""}
                {order.shipment.status === "returned_to_origin" ? " · came back" : ""}
              </p>
              {order.orderStatus === "shipped" ? (
                <div className="space-y-3 pt-1">
                  <DeliveredButton orderId={order.id} />
                  <ReturnedForm orderId={order.id} />
                </div>
              ) : null}
            </section>
          ) : null}

          {awaitingRemittance ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl">Cash with the courier</h2>
              <p className="text-sm text-espresso-soft">The courier collected {formatINR(order.totalMinor)} on delivery.</p>
              <RemittedForm orderId={order.id} amountMinor={order.totalMinor} />
            </section>
          ) : null}

          {order.payment || order.refunds.length || refundable > 0 ? (
            <section className="space-y-3 text-sm">
              <h2 className="font-display text-xl">Money</h2>
              <dl className="space-y-1">
                {order.payment ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-espresso-soft">Razorpay</dt>
                    <dd>{order.payment.status === "captured" ? "Received" : order.payment.status === "created" ? "Not paid" : order.payment.status}</dd>
                  </div>
                ) : null}
                {order.payment?.providerPaymentId ? <dd className="font-mono text-xs text-espresso-soft">{order.payment.providerPaymentId}</dd> : null}
                {order.payment?.failureReason ? <p className="text-espresso-soft">Last attempt: {order.payment.failureReason}</p> : null}
                {order.refunds.map((r) => (
                  <div key={r.id} className="flex justify-between gap-4">
                    <dt className="text-espresso-soft">
                      Refund{r.method === "razorpay" ? "" : r.method === "manual_upi" ? " by UPI" : " by bank"}
                      {r.status === "initiated" ? " (on its way)" : r.status === "failed" ? " (failed)" : ""}
                    </dt>
                    <dd className={r.status === "failed" ? "line-through" : ""}>−{formatINR(r.amountMinor)}</dd>
                  </div>
                ))}
              </dl>
              {refundable > 0 && isOwner ? <RefundForm orderId={order.id} refundableMinor={refundable} razorpay={canRazorpayRefund} /> : null}
            </section>
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
