import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/admin/activity-list";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { OrderStatusBadge } from "@/components/admin/order-status";
import { Card, Chip, FormError, PageHeader, Stat } from "@/components/admin/ui";
import { db } from "@/db/client";
import { formatINR } from "@/lib/money";
import { FORWARD } from "@/lib/transition-types";
import { listActivity } from "@/modules/activity/feed";
import { getLiveNow } from "@/modules/activity/now";
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

const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Fact({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-espresso-soft">{label}</dt>
      <dd className="font-display text-2xl tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-espresso-soft">{hint}</dd> : null}
    </div>
  );
}

/** Krishna's first screen: what's waiting on her, what's going on now, what just happened, and how things are going. */
export default async function TodayPage() {
  const { user } = await requireAdmin();
  const now = new Date();
  const [o, failedEmails, recent, low, live, latest] = await Promise.all([getOverview(db), failedEmailCount(db), listOrders(db, "open"), listLowStock(6), getLiveNow(db), listActivity(db, { limit: 8 })]);
  const waiting = o.needsYou + o.toPack + o.toShip;
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <AutoRefresh />
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
        <Stat label="To pack" value={o.toPack} hint="Paid, ready to go" href="/admin/orders?show=open" />
        <Stat label="To send" value={o.toShip} hint="Packed, for the courier" href="/admin/orders?show=open" />
        <Stat label="On the way" value={o.onTheWay} hint="With the courier" href="/admin/orders?show=open" />
      </section>

      {live.jobLate ? <FormError message={`The scheduled jobs last ran at ${when.format(live.lastJobAt!)}. Emails and unpaid checkouts wait until they run again.`} /> : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Happening now">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Checking out" value={live.checkouts.length} hint="Not paid yet" />
            <Fact label="Pieces on hold" value={live.unitsOnHold} hint="While they pay" />
            <Fact label="Bags in use" value={live.bags.bags} hint={live.bags.bags ? `${live.bags.units} ${live.bags.units === 1 ? "piece" : "pieces"}, ${formatINR(live.bags.minor)}` : "In the last hour"} />
            <Fact label="Waiting for a piece" value={live.alertsWaiting} hint="Back-in-stock alerts" />
          </dl>
          {live.checkouts.length ? (
            <ul className="-mx-2 mt-5 border-t border-sand pt-3">
              {live.checkouts.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/orders/${c.id}`} transitionTypes={FORWARD} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sand/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.contactName}</span>
                      <span className="block text-xs text-espresso-soft tabular-nums">
                        {c.orderNumber} · {c.holdEndsAt ? `held until ${clock.format(c.holdEndsAt)}` : "hold ended"}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums">{formatINR(c.totalMinor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 text-xs text-espresso-soft">
            {live.emailsWaiting ? `${live.emailsWaiting} ${live.emailsWaiting === 1 ? "email" : "emails"} waiting to send. ` : ""}
            {live.lastJobAt ? `Scheduled jobs last ran at ${clock.format(live.lastJobAt)}. ` : "No scheduled job has run yet. "}
            Updates by itself.
          </p>
        </Card>

        <Card
          title="Just happened"
          action={
            <Link href="/admin/activity" transitionTypes={FORWARD} className="link text-sm">
              All activity
            </Link>
          }
        >
          {latest.rows.length ? <ActivityList rows={latest.rows} /> : <p className="text-sm text-espresso-soft">Nothing yet. It shows here as soon as it happens.</p>}
        </Card>
      </div>

      <section aria-label="Money" className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Stat label="Last 7 days" value={formatINR(o.week.minor)} hint={`${o.week.orders} ${o.week.orders === 1 ? "order" : "orders"}`} />
        <Stat label="Last 30 days" value={formatINR(o.month.minor)} hint={`${o.month.orders} ${o.month.orders === 1 ? "order" : "orders"}, before refunds`} />
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
                    <OrderStatusBadge status={r.orderStatus} needsResolution={r.needsResolution} />
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
