import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { listOrders, type OrderListFilter } from "@/modules/orders/service";
import { OrderStatusBadge } from "@/components/admin/order-status";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: [OrderListFilter, string][] = [
  ["to_check", "To confirm"],
  ["open", "Open"],
  ["all", "All"],
];

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const { show } = await searchParams;
  const filter: OrderListFilter = FILTERS.some(([f]) => f === show) ? (show as OrderListFilter) : "open";
  const orders = await listOrders(db, filter);

  return (
    <div>
      <h1 className="font-display text-3xl">Orders</h1>
      <nav aria-label="Show" className="mt-6 flex gap-5 text-sm">
        {FILTERS.map(([f, label]) => (
          <Link key={f} href={`/admin/orders?show=${f}`} aria-current={f === filter ? "page" : undefined} className={f === filter ? "font-medium" : "link"}>
            {label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="mt-10 text-espresso-soft">{filter === "to_check" ? "Nothing to confirm. Every cash-on-delivery order has been checked." : "No orders here yet."}</p>
      ) : (
        <ul className="mt-6 divide-y divide-sand border-y border-sand">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-4 hover:bg-champagne sm:grid-cols-[8rem_1fr_7rem_9rem] sm:items-center"
              >
                <span className="font-medium tabular-nums">{o.orderNumber}</span>
                <span className="text-right text-sm tabular-nums sm:order-last">
                  <OrderStatusBadge status={o.orderStatus} method={o.paymentMethod} verified={o.codVerifiedAt !== null} />
                </span>
                <span className="text-sm">
                  {o.contactName} <span className="text-espresso-soft">· {o.city} · {formatMobile(o.contactPhone)}</span>
                  <span className="block text-xs text-espresso-soft">{when.format(o.createdAt)}</span>
                </span>
                <span className="text-sm tabular-nums sm:text-right">
                  {formatINR(o.totalMinor)}
                  <span className="block text-xs text-espresso-soft">
                    {o.units} {o.units === 1 ? "piece" : "pieces"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
