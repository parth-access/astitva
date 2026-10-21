"use server";

import { db } from "@/db/client";
import { normaliseMobile } from "@/lib/india";
import { sendQueuedEmailsSoon } from "@/modules/email/soon";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";
import { normaliseOrderNumber, requestOrderLink } from "@/modules/orders/lookup";

export type LookupState = {
  error?: string;
  /** Which field doesn't look right (its shape only: nothing is said about whether an order matched). */
  fields?: { orderNumber?: string; phone?: string };
  sent?: boolean;
  /** The order number as we read it, for the WhatsApp message on the "check your inbox" screen. */
  orderNumber?: string;
  values?: { orderNumber: string; phone: string };
};

export async function findOrderAction(_prev: LookupState, form: FormData): Promise<LookupState> {
  const values = { orderNumber: String(form.get("orderNumber") ?? ""), phone: String(form.get("phone") ?? "") };
  const orderNumber = normaliseOrderNumber(values.orderNumber);
  const fields = {
    ...(orderNumber ? {} : { orderNumber: values.orderNumber.trim() ? "That doesn't look like an order number. It's the digits after AST-, like 1005." : "Your order number, please." }),
    ...(normaliseMobile(values.phone) ? {} : { phone: values.phone.trim() ? "A 10-digit Indian mobile number, like 98123 45678." : "The mobile number you ordered with, please." }),
  };
  if (Object.keys(fields).length) return { values, fields };

  if (!(await allowRequest(LIMITS.orderLookup))) {
    return { values, error: "That's a few tries in a short time. Please wait a quarter of an hour, or message us on WhatsApp." };
  }
  await requestOrderLink(db, values);
  sendQueuedEmailsSoon();
  // The same answer whether or not anything matched.
  return { sent: true, orderNumber: orderNumber ?? undefined, values };
}
