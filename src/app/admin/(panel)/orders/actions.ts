"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/modules/auth/auth";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { cancelOrder, markCodVerified, OrderRuleError } from "@/modules/orders/service";

export type OrderActionState = { error?: string; done?: boolean };

const id = z.uuid();

async function run(orderId: string, work: (actorId: string) => Promise<void>): Promise<OrderActionState> {
  const { user } = await requireAdmin();
  if (!id.safeParse(orderId).success) return { error: "That order doesn't exist." };
  try {
    await work(user.id);
  } catch (err) {
    if (err instanceof OrderRuleError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { done: true };
}

/** Krishna has spoken to the buyer and the order is real. */
export async function verifyOrderAction(orderId: string): Promise<OrderActionState> {
  return run(orderId, (actorId) => markCodVerified(db, orderId, actorId));
}

/** Cancel before dispatch. Stock goes back on sale. */
export async function cancelOrderAction(orderId: string, _prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const reason = String(form.get("reason") ?? "");
  const result = await run(orderId, (actorId) => cancelOrder(db, orderId, actorId, reason));
  // The pieces are back on sale: the shop must show them again.
  if (result.done) updateTag(CATALOG_TAG);
  return result;
}
