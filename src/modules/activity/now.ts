import { desc, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { auditLogs } from "@/db/schema";

/** A bag touched this recently counts as someone shopping. */
const ACTIVE_BAG_MINUTES = 60;
/** The database calls the frequent job when there's work, and at least every 3 hours: this long without one means it has stopped. */
export const JOB_LATE_MINUTES = 240;

export type LiveNow = {
  checkouts: { id: string; orderNumber: string; contactName: string; totalMinor: number; holdEndsAt: Date | null }[];
  unitsOnHold: number;
  bags: { bags: number; units: number; minor: number };
  alertsWaiting: number;
  emailsWaiting: number;
  lastJobAt: Date | null;
  jobLate: boolean;
};

/** What's going on in the shop at this moment, for the admin's Today page. */
export async function getLiveNow(db: DbOrTx): Promise<LiveNow> {
  const [checkouts, counts, bags, [job]] = await Promise.all([
    db.execute<{ id: string; order_number: string; contact_name: string; total_minor: string; hold_ends_at: Date | string | null }>(sql`
      select o.id, o.order_number, o.contact_name, o.total_minor,
        (select min(r.expires_at) from inventory_reservations r where r.order_id = o.id and r.status = 'active' and r.expires_at > now()) as hold_ends_at
      from orders o
      where o.order_status = 'pending_payment' and o.payment_status = 'unpaid'
      order by o.created_at desc
      limit 8`),
    db.execute<{ held: string; alerts: string; emails: string }>(sql`
      select
        (select coalesce(sum(quantity), 0) from inventory_reservations where status = 'active' and expires_at > now()) as held,
        (select count(*) from stock_alerts where notified_at is null) as alerts,
        (select count(*) from email_outbox where status = 'pending') as emails`),
    db.execute<{ bags: string; units: string; minor: string }>(sql`
      select count(distinct i.cart_id) as bags, coalesce(sum(i.quantity), 0) as units, coalesce(sum(i.quantity * v.price_minor), 0) as minor
      from cart_items i
      join product_variants v on v.id = i.variant_id
      where i.cart_id in (select cart_id from cart_items where updated_at > now() - make_interval(mins => ${ACTIVE_BAG_MINUTES}))`),
    db
      .select({ at: auditLogs.createdAt })
      .from(auditLogs)
      .where(sql`${auditLogs.action} = 'job.ran' and ${auditLogs.resourceId} = 'frequent'`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(1),
  ]);
  const c = counts.rows[0];
  const b = bags.rows[0];
  const lastJobAt = job?.at ?? null;
  return {
    checkouts: checkouts.rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      contactName: r.contact_name,
      totalMinor: Number(r.total_minor),
      holdEndsAt: r.hold_ends_at ? new Date(r.hold_ends_at) : null,
    })),
    unitsOnHold: Number(c?.held ?? 0),
    bags: { bags: Number(b?.bags ?? 0), units: Number(b?.units ?? 0), minor: Number(b?.minor ?? 0) },
    alertsWaiting: Number(c?.alerts ?? 0),
    emailsWaiting: Number(c?.emails ?? 0),
    lastJobAt,
    jobLate: lastJobAt !== null && Date.now() - lastJobAt.getTime() > JOB_LATE_MINUTES * 60_000,
  };
}
