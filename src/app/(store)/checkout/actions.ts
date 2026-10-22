"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { normaliseMobile } from "@/lib/india";
import { BAG_COOKIE, findBag, readBag } from "@/modules/bag/service";
import { priceOrder, type OrderTotals } from "@/modules/checkout/pricing";
import { getCheckoutSettings } from "@/modules/checkout/queries";
import { checkCode } from "@/modules/discounts/service";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { parseCheckoutForm } from "@/modules/checkout/input";
import { CheckoutError, MAX_UNVERIFIED_COD, placeOrder } from "@/modules/checkout/service";
import { isOrderLinkKey, orderLinkKey, orderPath } from "@/modules/orders/links";
import { alertError } from "@/modules/email/outbox";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";
import { sendQueuedEmailsSoon } from "@/modules/email/soon";
import { razorpay } from "@/modules/payments/client";
import { confirmFromCheckout, openPayment, PaymentError, type CheckoutSession } from "@/modules/payments/service";

export type CheckoutState = {
  errors: Record<string, string>;
  /** A problem with the order as a whole, shown above the button. */
  message?: string;
  /** The bag changed under the buyer (sold out): send them back to it. */
  bagChanged?: boolean;
  values?: Record<string, string>;
  /** Online: open Razorpay's window with this. */
  payment?: CheckoutSession & { orderPath: string };
  /** The code stopped being valid between applying it and placing the order. */
  discountRejected?: boolean;
};

export type DiscountPreview =
  | { ok: true; code: string; label: string; totals: { cod: OrderTotals; online: OrderTotals }; overCodLimit: boolean }
  | { ok: false; message: string };

/** "Apply" on the checkout page: is the code good for this bag, and what does the order come to with it? */
export async function previewDiscountAction(input: string, phone: string): Promise<DiscountPreview> {
  if (!(await allowRequest(LIMITS.checkoutIp))) return { ok: false, message: "Too many tries in a short time. Please wait a few minutes." };
  const bag = await findBag(db, (await cookies()).get(BAG_COOKIE)?.value);
  if (!bag) return { ok: false, message: "Your bag is empty." };
  const contents = await readBag(db, bag.id);
  const lines = contents.lines.map((l) => ({ unitPriceMinor: l.priceMinor, quantity: l.quantity }));
  const check = await checkCode(db, input, { subtotalMinor: contents.subtotalMinor, phone: normaliseMobile(phone) });
  if (!check.ok) return check;
  const settings = await getCheckoutSettings();
  const totals = { cod: priceOrder(lines, settings, "cod", check.rule), online: priceOrder(lines, settings, "online", check.rule) };
  return { ok: true, code: check.code, label: check.label, totals, overCodLimit: totals.cod.totalMinor > settings.codMaxOrderMinor };
}

const MESSAGES: Record<CheckoutError["code"], string> = {
  ordering_closed: "Ordering isn't open yet. Nothing has been charged or placed.",
  cod_off: "Cash on delivery is paused for now. Please pay online, or message us.",
  empty: "Your bag is empty.",
  unavailable: "Someone has just bought one of your pieces. Your bag shows which; change it and place the order again.",
  over_cod_limit: "This order is over our cash-on-delivery limit. Please pay online, or message us and we'll arrange it.",
  pincode: "We can't deliver to this pincode yet. Please message us.",
  too_many_unverified: `This number already has ${MAX_UNVERIFIED_COD} cash-on-delivery orders we haven't packed yet. Pay online, or order again once they're on their way.`,
  discount: "That code can't be used on this order.",
};

const linkFor = (orderId: string, orderNumber: string) => orderPath(orderNumber, orderLinkKey(orderId, env().BETTER_AUTH_SECRET));

export async function placeOrderAction(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const values = Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));
  const parsed = parseCheckoutForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };
  if (!(await allowRequest(LIMITS.checkoutIp)) || !(await allowRequest(LIMITS.checkoutPhone, parsed.data.contact.phone))) {
    return { errors: {}, values, message: "Too many orders in a short time. Please wait a little, or message us and we'll help." };
  }

  const rzp = parsed.data.paymentMethod === "online" ? razorpay() : null;
  if (parsed.data.paymentMethod === "online" && !rzp) return { errors: {}, message: "Online payment isn't available right now.", values };

  const bag = await findBag(db, (await cookies()).get(BAG_COOKIE)?.value);
  if (!bag) return { errors: {}, message: MESSAGES.empty, values };

  let placed;
  try {
    placed = await placeOrder(db, bag.id, parsed.data);
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.code === "discount") return { errors: { discountCode: err.detail ?? MESSAGES.discount }, values, discountRejected: true };
      return { errors: {}, message: MESSAGES[err.code], bagChanged: err.code === "unavailable", values };
    }
    throw err;
  }
  // Stock changed (taken or held): the shop's sold-out marks must follow.
  updateTag(CATALOG_TAG);
  sendQueuedEmailsSoon();

  const path = linkFor(placed.orderId, placed.orderNumber);
  if (placed.paymentMethod === "cod" || placed.orderStatus !== "pending_payment") redirect(path);

  try {
    return { errors: {}, values, payment: { ...(await openPayment(db, rzp!, placed.orderId)), orderPath: path } };
  } catch (err) {
    if (err instanceof PaymentError) {
      return { errors: {}, values, message: "We couldn't reach the payment service, so nothing was charged and your pieces are back in your bag. Please try again in a minute, or choose cash on delivery." };
    }
    throw err;
  }
}

const reply = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Razorpay's window reported success. Confirm with Razorpay, then go to the order page. */
export async function confirmPaymentAction(input: z.infer<typeof reply>): Promise<{ path: string } | { error: string }> {
  const parsed = reply.safeParse(input);
  const rzp = razorpay();
  if (!parsed.success || !rzp) return { error: "That payment reply wasn't valid." };
  try {
    const result = await confirmFromCheckout(db, rzp, parsed.data);
    updateTag(CATALOG_TAG);
    sendQueuedEmailsSoon();
    return { path: linkFor(result.orderId, result.orderNumber) };
  } catch (err) {
    // A real payment we couldn't confirm is worth a look, whatever the cause.
    await alertError(db, "Payment confirmation", `Razorpay payment ${parsed.data.razorpayPaymentId} (order ${parsed.data.razorpayOrderId}): ${(err as Error).message}`).catch(() => {});
    sendQueuedEmailsSoon();
    if (err instanceof PaymentError) {
      return { error: "We couldn't confirm that payment yet. If money left your account, it is safe: we'll match it within minutes, and your order page will update." };
    }
    throw err;
  }
}

/** "Pay now" on the order page, for an order whose payment window was closed. */
export async function resumePaymentAction(orderId: string, key: string): Promise<{ payment: CheckoutSession } | { error: string }> {
  const rzp = razorpay();
  if (!z.uuid().safeParse(orderId).success || !isOrderLinkKey(orderId, key, env().BETTER_AUTH_SECRET) || !rzp) {
    return { error: "This order can't be paid from here." };
  }
  try {
    return { payment: await openPayment(db, rzp, orderId) };
  } catch (err) {
    if (err instanceof PaymentError) {
      return { error: err.code === "not_payable" ? "This order is no longer waiting for payment." : "The payment service is unavailable. Please try again in a minute." };
    }
    throw err;
  }
}
