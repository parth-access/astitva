import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { FORWARD } from "@/lib/transition-types";
import { requireAdmin } from "@/modules/auth/auth";
import { countOrdersToCheck, listOrders, type OrderListFilter } from "@/modules/orders/service";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { cardClass, EmptyState, PageHeader, Tabs } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: [OrderListFilter, string][] = [
  ["to_check", "Needs you"],
  ["open", "Open"],
  ["all", "All"],
];

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const EMPTY: Record<OrderListFilter, [string, string]> = {
  to_check: ["Nothing waiting on you", "Cash orders to confirm and paid orders that can't go ahead show here."],
  open: ["No open orders", "Orders show here from the moment they're placed until they're delivered and paid for."],
  all: ["No orders yet", "The first one will show here."],
};

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const { show } = await searchParams;
  const filter: OrderListFilter = FILTERS.some(([f]) => f === show) ? (show as OrderListFilter) : "open";
  const [orders, toCheck] = await Promise.all([listOrders(db, filter), countOrdersToCheck(db)]);

  return (
    <div>
      <PageHeader title="Orders" subtitle="Newest first. Open an order to confirm, pack, send or refund it." />
      <Tabs
        label="Show"
        current={filter}
        items={FILTERS.map(([f, label]) => ({ key: f, label, href: `/admin/orders?show=${f}`, count: f === "to_check" ? toCheck : undefined }))}
      />

      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState title={EMPTY[filter][0]}>{EMPTY[filter][1]}</EmptyState>
        ) : (
          <ul className={`${cardClass} divide-y divide-sand/70 overflow-hidden`}>
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  transitionTypes={FORWARD}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-4 transition-colors hover:bg-champagne/50 sm:grid-cols-[9rem_1fr_8rem_9rem] sm:px-5"
                >
                  <span className="font-medium tabular-nums">
                    {o.orderNumber}
                    <span className="block text-xs font-normal text-espresso-soft">{when.format(o.createdAt)}</span>
                  </span>
                  <span className="justify-self-end sm:order-last">
                    <OrderStatusBadge status={o.orderStatus} method={o.paymentMethod} verified={o.codVerifiedAt !== null} needsResolution={o.needsResolution} />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{o.contactName}</span>
                    <span className="block truncate text-xs text-espresso-soft">
                      {o.city} · {formatMobile(o.contactPhone)}
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums sm:text-right">
                    {formatINR(o.totalMinor)}
                    <span className="block text-xs text-espresso-soft">
                      {o.units} {o.units === 1 ? "piece" : "pieces"} · {o.paymentMethod === "cod" ? "Cash" : "Online"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
