"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { subscribeToRestock } from "@/modules/alerts/service";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";

export type AlertResult = { ok: true; message: string } | { ok: false; message: string };

/** "Tell me when it's back" for one colour and size. */
export async function subscribeRestockAction(variantId: string, email: string): Promise<AlertResult> {
  if (!z.uuid().safeParse(variantId).success) return { ok: false, message: "That piece isn't available." };
  if (!(await allowRequest(LIMITS.stockAlert))) return { ok: false, message: "That's a few sign-ups in a short time. Please try again in a few minutes." };
  const outcome = await subscribeToRestock(db, variantId, email);
  switch (outcome) {
    case "subscribed":
    case "already":
      return { ok: true, message: "Done. We'll email you once when it's back, then forget your address." };
    case "in_stock":
      return { ok: true, message: "Good news: it's just come back. Refresh the page to choose it." };
    case "invalid_email":
      return { ok: false, message: "That doesn't look like an email address." };
    case "unavailable":
      return { ok: false, message: "This piece is no longer offered." };
  }
}
