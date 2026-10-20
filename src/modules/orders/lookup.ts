/**
 * "Find my order": a buyer who lost their private link gives the order number
 * and the mobile number on it. If both match and the order has an email, the
 * link is emailed there; it is never shown on the page.
 *
 * The page answers the same way whether or not anything matched, so it can't
 * be used to find out who ordered what. Requests are rate-limited by the caller.
 */
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { orders } from "@/db/schema";
import { normaliseMobile } from "@/lib/india";
import { queueEmail } from "@/modules/email/outbox";

/** "1001", "001001", "AST-001001", "ast 1001" → "AST-001001". Null if it can't be an order number. */
export function normaliseOrderNumber(input: string): string | null {
  const digits = input.trim().toUpperCase().replace(/^AST[\s-]*/, "").replace(/\s/g, "");
  if (!/^\d{1,6}$/.test(digits)) return null;
  return `AST-${digits.padStart(6, "0")}`;
}

export type LookupOutcome = "emailed" | "no_email" | "no_match" | "invalid";

/** For tests and logs only: the page shows the same message for every outcome but "invalid". */
export async function requestOrderLink(db: DbOrTx, input: { orderNumber: string; phone: string }): Promise<LookupOutcome> {
  const orderNumber = normaliseOrderNumber(input.orderNumber);
  const phone = normaliseMobile(input.phone);
  if (!orderNumber || !phone) return "invalid";
  const [order] = await db
    .select({ id: orders.id, email: orders.contactEmail })
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.contactPhone, phone)));
  if (!order) return "no_match";
  if (!order.email) return "no_email";
  // At most one such email per order per hour.
  const hour = new Date().toISOString().slice(0, 13);
  await queueEmail(db, { dedupeKey: `order_link:${order.id}:${hour}`, template: "order_link", to: order.email, payload: { orderId: order.id } });
  return "emailed";
}
