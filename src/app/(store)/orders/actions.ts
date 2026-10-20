"use server";

import { db } from "@/db/client";
import { sendQueuedEmailsSoon } from "@/modules/email/soon";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";
import { requestOrderLink } from "@/modules/orders/lookup";

export type LookupState = { error?: string; sent?: boolean; values?: { orderNumber: string; phone: string } };

export async function findOrderAction(_prev: LookupState, form: FormData): Promise<LookupState> {
  const values = { orderNumber: String(form.get("orderNumber") ?? ""), phone: String(form.get("phone") ?? "") };
  if (!(await allowRequest(LIMITS.orderLookup))) {
    return { values, error: "That's a few tries in a short time. Please wait a quarter of an hour, or message us on WhatsApp." };
  }
  const outcome = await requestOrderLink(db, values);
  if (outcome === "invalid") return { values, error: "Check the order number (like AST-001001) and your 10-digit mobile number." };
  sendQueuedEmailsSoon();
  // The same answer whether or not anything matched.
  return { sent: true };
}
