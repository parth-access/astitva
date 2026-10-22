import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { Card, Chip, FormError, PageHeader, Stat } from "@/components/admin/ui";
import { db } from "@/db/client";
import { formatINR } from "@/lib/money";
import { FORWARD } from "@/lib/transition-types";
import { requireAdmin } from "@/modules/auth/auth";
import { listLowStock } from "@/modules/catalog-admin/queries";
import { failedEmailCount } from "@/modules/email/outbox";
import { getOverview } from "@/modules/orders/overview";
import { listOrders } from "@/modules/orders/service";

export const metadata: Metadata = { title: "Today" };

const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
const hourIST = new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" });
const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function greeting(now: Date) {
  const h = Number(hourIST.format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Krishna's first screen: what's waiting on her, then how things are going. */
export default async function TodayPage() {
  const { user } = await requireAdmin();
  const now = new Date();
  const [o, failedEmails, recent, low] = await Promise.all([getOverview(db), failedEmailCount(db), listOrders(db, "open"), listLowStock(6)]);
  const waiting = o.needsYou + o.toPack + o.toShip;
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={day.format(now)}
        title={`${greeting(now)}, ${firstName}`}
        subtitle={waiting ? `${waiting} ${waiting === 1 ? "order needs" : "orders need"} something from you.` : "Nothing is waiting on you."}
        actions={
          <Link href="/admin/pieces/new" transitionTypes={FORWARD} className="btn-primary">
            Add a piece
          </Link>
        }
      />

      {failedEmails ? (
        <FormError
          message={`${failedEmails} ${failedEmails === 1 ? "email" : "emails"} couldn't be sent after six tries. Check Resend's dashboard (the domain and the API key), then tell Parth.`}
        />
      ) : null}

      <section aria-label="Waiting on you" className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat label="Needs you" value={o.needsYou} hint="Paid, but can't go ahead" href="/admin/orders?show=to_check" tone={o.needsYou ? "attention" : undefined} />
        <Stat label="To pack" value={o.toPack} hint="Cash on delivery, or paid" href="/admin/orders?show=open" />
        <Stat label="To send" value={o.toShip} hint="Packed, for the courier" href="/admin/orders?show=open" />
        <Stat label="On the way" value={o.onTheWay} hint="With the courier" href="/admin/orders?show=open" />
      </section>

      <section aria-label="Money" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Last 7 days" value={formatINR(o.week.minor)} hint={`${o.week.orders} ${o.week.orders === 1 ? "order" : "orders"}`} />
        <Stat label="Last 30 days" value={formatINR(o.month.minor)} hint={`${o.month.orders} ${o.month.orders === 1 ? "order" : "orders"}, before refunds`} />
        <Stat
          label="Cash with couriers"
          value={formatINR(o.cashDue.minor)}
          hint={o.cashDue.orders ? `${o.cashDue.orders} delivered, not yet paid over` : "Nothing owed"}
          href={o.cashDue.orders ? "/admin/orders?show=open" : undefined}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card
          title="Open orders"
          action={
            <Link href="/admin/orders" transitionTypes={FORWARD} className="link text-sm">
              All orders
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="text-sm text-espresso-soft">No open orders. New ones show here as they come in.</p>
          ) : (
            <ul className="-mx-2">
              {recent.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/orders/${r.id}`} transitionTypes={FORWARD} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-champagne/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.contactName}</span>
                      <span className="block text-xs text-espresso-soft tabular-nums">
                        {r.orderNumber} · {when.format(r.createdAt)}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums">{formatINR(r.totalMinor)}</span>
                    <OrderStatusBadge status={r.orderStatus} method={r.paymentMethod} needsResolution={r.needsResolution} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Running low"
          action={
            <Link href="/admin/pieces" transitionTypes={FORWARD} className="link text-sm">
              Pieces
            </Link>
          }
        >
          {low.length === 0 ? (
            <p className="text-sm text-espresso-soft">Every colour and size is above its low-stock mark.</p>
          ) : (
            <ul className="-mx-2">
              {low.map((v, i) => (
                <li key={`${v.productId}-${v.color}-${v.size}-${i}`}>
                  <Link href={`/admin/pieces/${v.productId}`} transitionTypes={FORWARD} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-champagne/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm italic">{v.pieceName ?? v.name}</span>
                      <span className="block text-xs text-espresso-soft">{[v.color, v.size].filter(Boolean).join(" · ") || "One size"}</span>
                    </span>
                    <Chip tone={v.onHand === 0 ? "attention" : "warning"}>{v.onHand === 0 ? "Sold out" : `${v.onHand} left`}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
