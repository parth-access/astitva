/**
 * Discount codes. An owner creates them in the admin; a buyer types one at
 * checkout.
 *
 * - `checkCode` previews a code against a bag (no lock), for the checkout page.
 * - `claimCode` runs inside the checkout transaction with the code's row
 *   locked, re-checks everything and counts the use, so a limited code can't be
 *   used more times than allowed, however many buyers race for it.
 * - `releaseCodeUse` gives the use back when an order is cancelled or never
 *   paid. Callers run it inside the one transition to "cancelled", so it
 *   happens once per order.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/create";
import { auditLogs, discountCodes, orders } from "@/db/schema";
import { formatINR } from "@/lib/money";
import type { DiscountRule } from "@/modules/checkout/pricing";

export const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

/** "launch 10" → "LAUNCH10". Null if it can't be a code. */
export function normaliseCode(input: string | null | undefined): string | null {
  const code = (input ?? "").toUpperCase().replace(/\s+/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** "10% off" / "₹500 off". */
export function describeRule(rule: DiscountRule): string {
  if (rule.kind === "percent") {
    const pct = rule.value / 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% off`;
  }
  return `${formatINR(rule.value)} off`;
}

export class DiscountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscountError";
  }
}

type Code = typeof discountCodes.$inferSelect;

/** Why this code can't be used on this order, or null. */
async function problem(db: DbOrTx, code: Code | undefined, ctx: { subtotalMinor: number; phone: string | null }, now: Date): Promise<string | null> {
  if (!code || !code.isActive) return "That code isn't valid.";
  if (code.startsAt && code.startsAt > now) return "That code isn't active yet.";
  if (code.endsAt && code.endsAt <= now) return "That code has expired.";
  if (code.maxUses !== null && code.usesCount >= code.maxUses) return "That code has been used up.";
  const min = Number(code.minSubtotalMinor);
  if (ctx.subtotalMinor < min) return `That code needs pieces worth at least ${formatINR(min)}.`;
  if (code.onePerPhone && ctx.phone) {
    const [used] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.discountCodeId, code.id), eq(orders.contactPhone, ctx.phone), ne(orders.orderStatus, "cancelled")))
      .limit(1);
    if (used) return "That code has already been used with this mobile number.";
  }
  return null;
}

const ruleOf = (c: Code): DiscountRule => ({ kind: c.kind, value: c.value });

export type CodeCheck = { ok: true; id: string; code: string; rule: DiscountRule; label: string } | { ok: false; message: string };

/** Preview for the checkout page. The order re-checks under lock. */
export async function checkCode(db: DbOrTx, input: string, ctx: { subtotalMinor: number; phone: string | null }): Promise<CodeCheck> {
  const code = normaliseCode(input);
  if (!code) return { ok: false, message: "That code isn't valid." };
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, code));
  const why = await problem(db, row, ctx, new Date());
  if (why) return { ok: false, message: why };
  return { ok: true, id: row!.id, code: row!.code, rule: ruleOf(row!), label: describeRule(ruleOf(row!)) };
}

/** Inside the checkout transaction: lock, re-check, count the use. */
export async function claimCode(tx: Tx, input: string, ctx: { subtotalMinor: number; phone: string }) {
  const code = normaliseCode(input);
  if (!code) throw new DiscountError("That code isn't valid.");
  const [row] = await tx.select().from(discountCodes).where(eq(discountCodes.code, code)).for("update");
  const why = await problem(tx, row, ctx, new Date());
  if (why) throw new DiscountError(why);
  await tx.update(discountCodes).set({ usesCount: sql`${discountCodes.usesCount} + 1` }).where(eq(discountCodes.id, row!.id));
  return { id: row!.id, code: row!.code, rule: ruleOf(row!) };
}

/** Give back an order's use of its code (cancelled, or never paid). */
export async function releaseCodeUse(tx: Tx, orderId: string) {
  const [o] = await tx.select({ codeId: orders.discountCodeId }).from(orders).where(eq(orders.id, orderId));
  if (!o?.codeId) return;
  await tx
    .update(discountCodes)
    .set({ usesCount: sql`greatest(${discountCodes.usesCount} - 1, 0)` })
    .where(eq(discountCodes.id, o.codeId));
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function listCodes(db: DbOrTx) {
  return db.select().from(discountCodes).orderBy(desc(discountCodes.isActive), desc(discountCodes.createdAt));
}

export type NewCode = {
  code: string;
  kind: "percent" | "amount";
  /** Basis points for percent, paise for amount. */
  value: number;
  minSubtotalMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  onePerPhone: boolean;
  note: string | null;
};

export async function createCode(db: DbOrTx, input: NewCode, actorId: string): Promise<string> {
  const code = normaliseCode(input.code);
  if (!code) throw new DiscountError("Codes are 3–32 letters, numbers or dashes.");
  const [existing] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code));
  if (existing) throw new DiscountError("There's already a code with that name.");
  const [row] = await db
    .insert(discountCodes)
    .values({ ...input, code, createdBy: actorId })
    .returning({ id: discountCodes.id });
  await db.insert(auditLogs).values({ actorId, action: "discount.created", resourceType: "discount_code", resourceId: row!.id, metadata: { code, kind: input.kind, value: input.value } });
  return row!.id;
}

/** Switch a code off (or back on). Codes are never deleted: orders refer to them. */
export async function setCodeActive(db: DbOrTx, id: string, isActive: boolean, actorId: string) {
  await db.update(discountCodes).set({ isActive }).where(eq(discountCodes.id, id));
  await db.insert(auditLogs).values({ actorId, action: isActive ? "discount.enabled" : "discount.disabled", resourceType: "discount_code", resourceId: id });
}
