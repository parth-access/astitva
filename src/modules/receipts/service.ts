/**
 * Receipts: one per order, numbered in sequence (ASTR-000001), frozen when
 * issued. Cash on delivery gets its receipt when the order is placed, for the
 * amount to pay on delivery; online orders get theirs when the payment is
 * captured. Both go out with the order confirmation email (with a PDF) and
 * show on the order's private page.
 *
 * Astitva has no GSTIN yet, so this is a payment receipt, not a tax invoice.
 *
 * Framework-free (the database is passed in) so tests can call it.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { codCollections, orderItems, orders, receipts, refunds, storeSettings, type ReceiptSnapshot } from "@/db/schema";
import { formatLongDate } from "@/lib/format";
import { formatINR } from "@/lib/money";

export type ReceiptPayment = { paidWith: string | null; providerPaymentId: string; paidAt: Date };

/**
 * Issues the order's receipt, once: calling again returns the one already
 * issued. Run inside the transaction that places the order (cash on delivery)
 * or records the capture (online, with `payment`).
 */
export async function issueReceipt(tx: DbOrTx, orderId: string, payment: ReceiptPayment | null = null): Promise<{ receiptNumber: string }> {
  const [existing] = await tx.select({ receiptNumber: receipts.receiptNumber }).from(receipts).where(eq(receipts.orderId, orderId));
  if (existing) return existing;

  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`No order ${orderId} to issue a receipt for.`);
  if (order.paymentMethod === "online" && !payment) throw new Error(`Order ${order.orderNumber} is paid online: its receipt needs the payment.`);
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));

  const snapshot: ReceiptSnapshot = {
    orderNumber: order.orderNumber,
    placedAt: order.createdAt.toISOString(),
    buyer: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail },
    address: order.addressSnapshot,
    items: items.map((i) => ({
      name: i.productNameSnapshot,
      variant: i.variantSnapshot,
      quantity: i.quantity,
      unitPriceMinor: Number(i.unitPriceMinor),
      lineTotalMinor: Number(i.lineTotalMinor),
    })),
    subtotalMinor: Number(order.subtotalMinor),
    discountMinor: Number(order.discountMinor),
    discountCode: order.discountCode,
    shippingMinor: Number(order.shippingMinor),
    codFeeMinor: Number(order.codFeeMinor),
    totalMinor: Number(order.totalMinor),
  };

  const [row] = await tx
    .insert(receipts)
    .values({
      orderId,
      paymentMethod: order.paymentMethod,
      amountMinor: Number(order.totalMinor),
      paidWith: payment?.paidWith?.slice(0, 24) ?? null,
      providerPaymentId: payment?.providerPaymentId ?? null,
      paidAt: payment?.paidAt ?? null,
      snapshot,
    })
    // Two captures racing (browser and webhook) both land here: one receipt.
    .onConflictDoNothing({ target: receipts.orderId })
    .returning({ receiptNumber: receipts.receiptNumber });
  if (row) return row;
  const [raced] = await tx.select({ receiptNumber: receipts.receiptNumber }).from(receipts).where(eq(receipts.orderId, orderId));
  return raced!;
}

/** Where the money stands now, beside the frozen receipt. */
export type ReceiptStatus =
  | { kind: "paid_online"; paidAt: Date; paidWith: string | null; reference: string }
  | { kind: "due_on_delivery" }
  | { kind: "paid_on_delivery"; paidAt: Date | null }
  | { kind: "not_collected" };

export type ReceiptView = {
  receiptNumber: string;
  issuedAt: Date;
  paymentMethod: "cod" | "online";
  amountMinor: number;
  order: ReceiptSnapshot;
  status: ReceiptStatus;
  /** Refunds that went through or are on their way. */
  refunds: { amountMinor: number; status: "initiated" | "succeeded"; at: Date }[];
  /** The shop's details, printed at the top. */
  shop: { email: string | null; whatsapp: string | null };
};

/** The order's receipt, if it has one, with where the money stands now. */
export async function getReceipt(db: DbOrTx, orderId: string): Promise<ReceiptView | null> {
  const [r] = await db.select().from(receipts).where(eq(receipts.orderId, orderId));
  if (!r) return null;
  const [[cod], back, [shop]] = await Promise.all([
    db.select({ status: codCollections.status, collectedAt: codCollections.collectedAt }).from(codCollections).where(eq(codCollections.orderId, orderId)),
    db
      .select({ amountMinor: refunds.amountMinor, status: refunds.status, at: refunds.createdAt })
      .from(refunds)
      .where(and(eq(refunds.orderId, orderId), sql`${refunds.status} <> 'failed'`))
      .orderBy(asc(refunds.createdAt)),
    db.select({ email: storeSettings.supportEmail, whatsapp: storeSettings.supportWhatsapp }).from(storeSettings).where(eq(storeSettings.id, 1)),
  ]);

  const status: ReceiptStatus =
    r.paymentMethod === "online"
      ? { kind: "paid_online", paidAt: r.paidAt!, paidWith: r.paidWith, reference: r.providerPaymentId ?? "" }
      : cod?.status === "collected_by_courier" || cod?.status === "remitted"
        ? { kind: "paid_on_delivery", paidAt: cod.collectedAt }
        : cod?.status === "failed"
          ? { kind: "not_collected" }
          : { kind: "due_on_delivery" };

  return {
    receiptNumber: r.receiptNumber,
    issuedAt: r.issuedAt,
    paymentMethod: r.paymentMethod,
    amountMinor: Number(r.amountMinor),
    order: r.snapshot,
    status,
    refunds: back.map((b) => ({ amountMinor: Number(b.amountMinor), status: b.status as "initiated" | "succeeded", at: b.at })),
    shop: { email: shop?.email ?? null, whatsapp: shop?.whatsapp ?? null },
  };
}

/** "UPI", "Card"… from Razorpay's method name. */
export function paidWithLabel(method: string | null): string {
  const names: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI", paylater: "Pay later" };
  return method ? (names[method] ?? method.charAt(0).toUpperCase() + method.slice(1)) : "Online";
}

/** One line on where the money stands, for the page, the PDF and the email. */
export function statusLine(v: Pick<ReceiptView, "status" | "amountMinor">): string {
  const s = v.status;
  const format = formatINR;
  const date = formatLongDate;
  switch (s.kind) {
    case "paid_online":
      return `Paid ${format(v.amountMinor)} online (${paidWithLabel(s.paidWith)}) on ${date(s.paidAt)}.`;
    case "due_on_delivery":
      return `To pay on delivery: ${format(v.amountMinor)}, in cash or by UPI to the courier.`;
    case "paid_on_delivery":
      return `Paid ${format(v.amountMinor)} on delivery${s.paidAt ? `, ${date(s.paidAt)}` : ""}.`;
    case "not_collected":
      return "Not paid: the order wasn't delivered.";
  }
}
