/**
 * Simple abuse limits: at most N actions per key in a fixed window, counted in
 * the database (serverless instances share no memory). One atomic upsert per
 * check, so concurrent requests can't slip past the count.
 *
 * Keys are hashed with a server secret, so the table never holds raw IP
 * addresses or phone numbers.
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { requestLimits } from "@/db/schema";

export type Limit = { name: string; max: number; windowSeconds: number };

/** The shop's limits. Generous for people; tight enough to stop scripts. */
export const LIMITS = {
  /** Bag changes per visitor (IP). */
  bag: { name: "bag", max: 60, windowSeconds: 10 * 60 },
  /** Checkout attempts per visitor (IP). */
  checkoutIp: { name: "checkout-ip", max: 10, windowSeconds: 10 * 60 },
  /** "Find my order" requests per visitor (IP): enough for typos, too few to guess with. */
  orderLookup: { name: "order-lookup", max: 5, windowSeconds: 15 * 60 },
  /** "Tell me when it's back" sign-ups per visitor (IP). */
  stockAlert: { name: "stock-alert", max: 10, windowSeconds: 10 * 60 },
  /** Orders placed per phone number. */
  checkoutPhone: { name: "checkout-phone", max: 5, windowSeconds: 60 * 60 },
  /** Sign-in codes sent per email address: a few resends, not an inbox flood. */
  signInCodeEmail: { name: "sign-in-code-email", max: 4, windowSeconds: 15 * 60 },
} satisfies Record<string, Limit>;

export function limitKey(limit: Limit, subject: string, secret: string): string {
  return `${limit.name}:${createHmac("sha256", secret).update(subject).digest("base64url").slice(0, 43)}`;
}

/** Count one action. Returns false when it is over the limit. */
export async function allow(db: DbOrTx, limit: Limit, subject: string, secret: string): Promise<boolean> {
  const key = limitKey(limit, subject, secret);
  const expired = sql`${requestLimits.windowStart} < now() - make_interval(secs => ${limit.windowSeconds})`;
  const [row] = await db
    .insert(requestLimits)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: requestLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${requestLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${requestLimits.windowStart} end`,
      },
    })
    .returning({ count: requestLimits.count });
  return (row?.count ?? 1) <= limit.max;
}

/** Daily: forget windows that ended long ago. */
export async function clearOldLimits(db: DbOrTx): Promise<number> {
  const rows = await db
    .delete(requestLimits)
    .where(sql`${requestLimits.windowStart} < now() - interval '1 day'`)
    .returning({ key: requestLimits.key });
  return rows.length;
}
