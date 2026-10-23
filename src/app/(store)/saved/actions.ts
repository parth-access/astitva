"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { listSavedIds, MAX_SAVED, savePiece, unsavePiece } from "@/modules/account/saved";
import { getCustomer } from "@/modules/auth/customer";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";

export type SavedResult = { ids: string[]; error?: string } | { signIn: true };

/** A heart tapped on or off. Answers with every saved style, as they now stand. */
export async function setSavedAction(productId: string, on: boolean): Promise<SavedResult> {
  const customer = await getCustomer();
  if (!customer) return { signIn: true };
  if (!z.uuid().safeParse(productId).success) return { ids: await listSavedIds(db, customer.id), error: "That piece isn't available." };
  if (!(await allowRequest(LIMITS.saved))) {
    return { ids: await listSavedIds(db, customer.id), error: "That's a lot of hearts in a short time. Please wait a few minutes." };
  }
  if (!on) {
    await unsavePiece(db, customer.id, productId);
    return { ids: await listSavedIds(db, customer.id) };
  }
  const outcome = await savePiece(db, customer.id, productId);
  const ids = await listSavedIds(db, customer.id);
  if (outcome === "unavailable") return { ids, error: "This piece is no longer offered." };
  if (outcome === "full") return { ids, error: `You've saved ${MAX_SAVED} pieces, the most we keep. Remove one first.` };
  return { ids };
}
