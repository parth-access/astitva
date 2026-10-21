import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";

/**
 * The admin's "Today" page: what's waiting on Krishna, what's moving, money
 * the courier still owes, and how the last week and month went. Sales count
 * orders that went ahead: not cancelled, not an unpaid online checkout, not
 * a parcel that came back. Refunds aren't taken off.
 */
export type Overview = {
  toConfirm: number;
  needsYou: number;
  toPack: number;
  toShip: number;
  onTheWay: number;
  cashDue: { orders: number; minor: number };
  week: { orders: number; minor: number };
  month: { orders: number; minor: number };
};

export async function getOverview(db: DbOrTx): Promise<Overview> {
  const went = sql`order_status not in ('cancelled', 'returned', 'pending_payment')`;
  const ready = sql`(payment_method = 'online' and payment_status <> 'unpaid') or (payment_method = 'cod' and cod_verified_at is not null)`;
  const cash = sql`order_status = 'delivered' and payment_method = 'cod' and payment_status = 'unpaid'`;
  const { rows } = await db.execute<Record<string, string | number>>(sql`
    select
      count(*) filter (where payment_method = 'cod' and order_status = 'confirmed' and cod_verified_at is null and not needs_resolution) as to_confirm,
      count(*) filter (where needs_resolution) as needs_you,
      count(*) filter (where order_status = 'confirmed' and not needs_resolution and (${ready})) as to_pack,
      count(*) filter (where order_status = 'packed') as to_ship,
      count(*) filter (where order_status = 'shipped') as on_the_way,
      count(*) filter (where ${cash}) as cash_orders,
      coalesce(sum(total_minor) filter (where ${cash}), 0) as cash_minor,
      count(*) filter (where ${went} and created_at >= now() - interval '7 days') as week_orders,
      coalesce(sum(total_minor) filter (where ${went} and created_at >= now() - interval '7 days'), 0) as week_minor,
      count(*) filter (where ${went} and created_at >= now() - interval '30 days') as month_orders,
      coalesce(sum(total_minor) filter (where ${went} and created_at >= now() - interval '30 days'), 0) as month_minor
    from orders`);
  const r = rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    toConfirm: n("to_confirm"),
    needsYou: n("needs_you"),
    toPack: n("to_pack"),
    toShip: n("to_ship"),
    onTheWay: n("on_the_way"),
    cashDue: { orders: n("cash_orders"), minor: n("cash_minor") },
    week: { orders: n("week_orders"), minor: n("week_minor") },
    month: { orders: n("month_orders"), minor: n("month_minor") },
  };
}
