/**
 * Housekeeping, run on a schedule (/api/cron/<job>, called by GitHub Actions).
 * Correctness never depends on these running: holds expire by time, emails
 * are also sent straight after each request. They keep things tidy and retry.
 *
 *   frequent (every 15 min): close abandoned online checkouts, mark lapsed holds, back-in-stock alerts, send/retry emails
 *   daily:                   clear expired bags, old limit counters and used alerts; the call itself keeps Supabase awake
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/create";
import { carts, orders } from "@/db/schema";
import type { SendEmail } from "@/lib/email";
import { processOutbox } from "@/modules/email/outbox";
import type { RenderContext } from "@/modules/email/templates";
import { markLapsedReservations } from "@/modules/inventory/service";
import { clearOldLimits } from "@/modules/limits/service";
import { abandonOrder } from "@/modules/payments/service";
import { clearOldAlerts, notifyRestocked } from "@/modules/alerts/service";

/** Online checkouts nobody paid for are cancelled after this long. Their holds lapsed long before. */
export const ABANDON_AFTER_MINUTES = 120;

export async function closeAbandonedCheckouts(db: Db, olderThanMinutes = ABANDON_AFTER_MINUTES): Promise<number> {
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.orderStatus, "pending_payment"),
        eq(orders.paymentStatus, "unpaid"),
        lt(orders.createdAt, sql`now() - make_interval(mins => ${olderThanMinutes})`),
      ),
    )
    .limit(200);
  for (const o of stale) await abandonOrder(db, o.id, "Not paid within two hours");
  return stale.length;
}

export async function clearExpiredBags(db: Db): Promise<number> {
  const rows = await db.delete(carts).where(lt(carts.expiresAt, sql`now()`)).returning({ id: carts.id });
  return rows.length;
}

export type JobName = "frequent" | "daily";

export async function runJob(db: Db, job: JobName, mail: { send: SendEmail; ctx: RenderContext }) {
  if (job === "frequent") {
    const abandoned = await closeAbandonedCheckouts(db);
    const lapsedHolds = await markLapsedReservations(db);
    // After closing checkouts: their stock may be exactly what someone is waiting for.
    const restockAlerts = await notifyRestocked(db);
    const emails = await processOutbox(db, mail.send, mail.ctx, { limit: 50 });
    return { emails, abandoned, lapsedHolds, restockAlerts };
  }
  const bags = await clearExpiredBags(db);
  const limits = await clearOldLimits(db);
  const alerts = await clearOldAlerts(db);
  return { bags, limits, alerts };
}
