"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { rupeesToPaise } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { notifyRestockedSoon } from "@/modules/alerts/soon";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import {
  markCodRemitted,
  markDelivered,
  markReturnedToOrigin,
  packOrder,
  resolveOrder,
  shipOrder,
  unpackOrder,
} from "@/modules/orders/fulfilment";
import { cancelOrder, markCodVerified, OrderRuleError } from "@/modules/orders/service";
import { alertError } from "@/modules/email/outbox";
import { sendQueuedEmailsSoon } from "@/modules/email/soon";
import { razorpay } from "@/modules/payments/client";
import { RefundError, refundOrder, type RefundMethod } from "@/modules/payments/refunds";

export type OrderActionState = { error?: string; done?: boolean };

const id = z.uuid();
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

async function run(orderId: string, work: (actorId: string) => Promise<unknown>, opts: { stockChanged?: boolean } = {}): Promise<OrderActionState> {
  const { user } = await requireAdmin();
  if (!id.safeParse(orderId).success) return { error: "That order doesn't exist." };
  try {
    await work(user.id);
  } catch (err) {
    if (err instanceof OrderRuleError || err instanceof RefundError) return { error: err.message };
    await alertError(db, "Admin order action", `Order ${orderId}: ${(err as Error).message}`).catch(() => {});
    sendQueuedEmailsSoon();
    throw err;
  }
  sendQueuedEmailsSoon();
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  // Pieces back on sale (cancelled, or a parcel came back): the shop must show them again.
  if (opts.stockChanged) {
    updateTag(CATALOG_TAG);
    notifyRestockedSoon();
  }
  return { done: true };
}

/** Krishna has spoken to the buyer and the order is real. */
export async function verifyOrderAction(orderId: string): Promise<OrderActionState> {
  return run(orderId, (actorId) => markCodVerified(db, orderId, actorId));
}

/** Cancel before dispatch. Stock goes back on sale. */
export async function cancelOrderAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(orderId, (actorId) => cancelOrder(db, orderId, actorId, text(form, "reason")), { stockChanged: true });
}

export async function packOrderAction(orderId: string): Promise<OrderActionState> {
  return run(orderId, (actorId) => packOrder(db, orderId, actorId));
}

export async function unpackOrderAction(orderId: string): Promise<OrderActionState> {
  return run(orderId, (actorId) => unpackOrder(db, orderId, actorId));
}

export async function shipOrderAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(orderId, (actorId) =>
    shipOrder(db, orderId, actorId, {
      carrierName: text(form, "carrierName"),
      trackingNumber: text(form, "trackingNumber"),
      trackingUrl: text(form, "trackingUrl") || null,
    }),
  );
}

export async function deliveredAction(orderId: string): Promise<OrderActionState> {
  return run(orderId, (actorId) => markDelivered(db, orderId, actorId));
}

export async function returnedAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(orderId, (actorId) => markReturnedToOrigin(db, orderId, actorId, text(form, "reason")), { stockChanged: true });
}

export async function remittedAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(orderId, (actorId) => markCodRemitted(db, orderId, actorId, text(form, "reference")));
}

export async function resolveAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run(orderId, (actorId) => resolveOrder(db, orderId, actorId, text(form, "note")));
}

const METHODS: RefundMethod[] = ["razorpay", "manual_upi", "manual_bank"];

/** Owners only: money leaves the business. */
export async function refundAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const { user } = await requireAdmin({ roles: ["owner"] });
  const method = text(form, "method") as RefundMethod;
  if (!METHODS.includes(method)) return { error: "Choose how the money goes back." };
  let amountMinor: number;
  try {
    amountMinor = rupeesToPaise(text(form, "amount").replace(/[,₹\s]/g, ""));
  } catch {
    return { error: "Enter rupees, like 3499 or 1200.50." };
  }
  return run(orderId, () =>
    refundOrder(db, razorpay(), orderId, user.id, { amountMinor, method, reason: text(form, "reason"), reference: text(form, "reference") }),
  );
}
