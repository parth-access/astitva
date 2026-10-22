import type { Metadata } from "next";
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
} from "@/components/admin/order-actions";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { Card, cardClass, PageHeader } from "@/components/admin/ui";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { isCancellable } from "@/modules/orders/machines";
import { packingBlocker } from "@/modules/orders/fulfilment";
import { orderLinkKey, orderPath } from "@/modules/orders/links";
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
  const canSend = (order.orderStatus === "confirmed" || order.orderStatus === "packed") && packingBlocker(order) === null;
  const awaitingRemittance = order.paymentMethod === "cod" && order.orderStatus === "delivered" && order.cod?.status === "collected_by_courier";
  const refundable = await refundableMinor(db, order.id);
  const canRazorpayRefund = order.payment?.status === "captured" && razorpay() !== null;
  const isOwner = role === "owner";
  const firstName = order.contactName.split(/\s+/)[0];
  // The buyer's private page, for a buyer who lost it.
  const buyerPage = `${env().APP_URL.replace(/\/$/, "")}${orderPath(order.orderNumber, orderLinkKey(order.id, env().BETTER_AUTH_SECRET))}`;
  const shareMessage = `Hello ${firstName}, here's the page for your Astitva order ${order.orderNumber}. It shows where your order is: ${buyerPage}`;

  const steps: { label: string; done: boolean }[] = [
    { label: "Placed", done: true },
    ...(order.paymentMethod === "online" ? [{ label: "Paid", done: order.paymentStatus !== "unpaid" }] : []),
    { label: "Packed", done: ["packed", "shipped", "delivered", "returned"].includes(order.orderStatus) },
    { label: "Sent", done: ["shipped", "delivered", "returned"].includes(order.orderStatus) },
    { label: "Delivered", done: order.orderStatus === "delivered" },
    ...(order.paymentMethod === "cod" ? [{ label: "Cash in", done: order.paymentStatus !== "unpaid" }] : []),
  ];
  const ended = order.orderStatus === "cancelled" || order.orderStatus === "returned" || order.orderStatus === "pending_payment";

  return (
    <div>
      <PageHeader
        back={{ href: "/admin/orders", label: "All orders" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">{order.orderNumber}</span>
            <OrderStatusBadge status={order.orderStatus} method={order.paymentMethod} needsResolution={order.needsResolution} />
          </span>
        }
        subtitle={
          <>
            {when.format(order.createdAt)} · {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentStatus === "unpaid" ? "Online, not paid" : "Paid online"} ·{" "}
            <span className="tabular-nums">{formatINR(order.totalMinor)}</span>
          </>
        }
      />

      {ended ? null : (
        <ol aria-label="Progress" className={`${cardClass} mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-2 px-4 py-4 sm:px-6`}>
          {steps.map((st, i) => (
            <li key={st.label} className="flex shrink-0 items-center gap-2">
              {i > 0 ? <span aria-hidden="true" className={`hidden h-px w-5 sm:block sm:w-10 ${st.done ? "bg-olive" : "bg-sand"}`} /> : null}
              <span
                aria-hidden="true"
                className={`grid size-6 place-items-center rounded-full text-[0.7rem] ${st.done ? "bg-olive text-ivory" : "border border-taupe/60 text-espresso-soft"}`}
              >
                {st.done ? "✓" : i + 1}
              </span>
              <span className={`text-sm ${st.done ? "text-espresso" : "text-espresso-soft"}`}>
                {st.label}
                <span className="sr-only">{st.done ? ", done" : ", not yet"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] xl:items-start">
        <div className="space-y-6">
          <Card title="Pieces">
            <ul className="divide-y divide-sand/70">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-4 py-3 text-sm first:pt-0">
                  <span>
                    <span className="font-medium">{i.name}</span>
                    <span className="block text-espresso-soft">
                      {[i.variant.color, i.variant.size].filter(Boolean).join(" · ")} · <span className="font-mono text-xs">{i.sku}</span>
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {i.quantity} × {formatINR(i.unitPriceMinor)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 rounded-lg bg-champagne/40 p-4 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-espresso-soft">Subtotal</dt>
                <dd>{formatINR(order.subtotalMinor)}</dd>
              </div>
              {order.discountMinor ? (
                <div className="flex justify-between">
                  <dt className="text-espresso-soft">Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt>
                  <dd>−{formatINR(order.discountMinor)}</dd>
                </div>
              ) : null}
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
              <div className="flex justify-between border-t border-sand pt-2 font-medium">
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
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Buyer">
              <p className="text-sm leading-relaxed">
                <span className="font-medium">{order.contactName}</span>
                <br />
                <a href={`tel:+91${order.contactPhone}`} className="link">
                  {formatMobile(order.contactPhone)}
                </a>
                {order.contactEmail ? (
                  <>
                    <br />
                    <span className="break-all">{order.contactEmail}</span>
                  </>
                ) : null}
              </p>
              <a href={whatsappLink(`91${order.contactPhone}`, shareMessage)} target="_blank" rel="noopener noreferrer" className="btn-outline mt-4 w-full text-sm">
                Send them their order page
              </a>
            </Card>
            <Card title="Ship to">
              <address className="text-sm not-italic leading-relaxed">
                <span className="font-medium">{a.recipientName}</span>
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
            </Card>
          </div>

          {order.customerNote ? (
            <Card title="Their note">
              <p className="whitespace-pre-line text-sm">{order.customerNote}</p>
            </Card>
          ) : null}

          <Card title="History">
            <ol className="relative space-y-4 border-l border-sand pl-5 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-paper bg-taupe" />
                  <span className="block">
                    {EVENT_LABEL[e.eventType] ?? e.eventType}
                    {(e.eventType === "order.cancelled" || e.eventType === "order.returned") && typeof e.metadata?.reason === "string" ? `: ${e.metadata.reason}` : ""}
                    {e.eventType.startsWith("refund.") && typeof e.metadata?.amountMinor === "number" ? ` ${formatINR(e.metadata.amountMinor)}` : ""}
                  </span>
                  <span className="block text-xs text-espresso-soft tabular-nums">{when.format(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="order-first space-y-6 xl:sticky xl:top-8 xl:order-none">
          {order.needsResolution ? (
            <Card title="Needs you" tone="attention">
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-line">{order.resolutionNote}</p>
                <p className="text-espresso-soft">Message the buyer to offer another colour or size, or refund them below.</p>
                <ResolveForm orderId={order.id} />
              </div>
            </Card>
          ) : null}

          {canSend ? (
            <Card title={order.orderStatus === "packed" ? "Packed. Send it" : "Pack and send"} tone="calm">
              <div className="space-y-4">
                {order.codVerifiedAt ? <p className="text-xs text-espresso-soft">Confirmed with the buyer {when.format(order.codVerifiedAt)}.</p> : null}
                {order.orderStatus === "confirmed" ? <PackButton orderId={order.id} /> : null}
                <ShipForm orderId={order.id} />
                {order.orderStatus === "packed" ? <UnpackButton orderId={order.id} /> : null}
              </div>
            </Card>
          ) : null}

          {order.shipment ? (
            <Card title="Parcel">
              <div className="space-y-3 text-sm">
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
              </div>
            </Card>
          ) : null}

          {awaitingRemittance ? (
            <Card title="Cash with the courier" tone="calm">
              <div className="space-y-3">
                <p className="text-sm text-espresso-soft">The courier collected {formatINR(order.totalMinor)} on delivery.</p>
                <RemittedForm orderId={order.id} amountMinor={order.totalMinor} />
              </div>
            </Card>
          ) : null}

          {order.payment || order.refunds.length || refundable > 0 ? (
            <Card title="Money">
              <div className="space-y-3 text-sm">
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
              </div>
            </Card>
          ) : null}

          {order.orderStatus === "cancelled" ? (
            <Card>
              <p className="text-sm text-espresso-soft">Cancelled{order.cancelReason ? `: ${order.cancelReason}` : "."}</p>
            </Card>
          ) : isCancellable(order.orderStatus) ? (
            <div className="px-1">
              <CancelOrder orderId={order.id} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
