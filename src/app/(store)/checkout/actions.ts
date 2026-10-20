"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { BAG_COOKIE, findBag } from "@/modules/bag/service";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { parseCheckoutForm } from "@/modules/checkout/input";
import { CheckoutError, MAX_UNVERIFIED_COD, placeCodOrder } from "@/modules/checkout/service";
import { orderLinkKey, orderPath } from "@/modules/orders/links";

export type CheckoutState = {
  errors: Record<string, string>;
  /** A problem with the order as a whole, shown above the button. */
  message?: string;
  /** The bag changed under the buyer (sold out): send them back to it. */
  bagChanged?: boolean;
  values?: Record<string, string>;
};

const MESSAGES: Record<CheckoutError["code"], string> = {
  ordering_closed: "Ordering isn't open yet. Nothing has been charged or placed.",
  cod_off: "Cash on delivery is paused for now. Please message us and we'll sort it out.",
  empty: "Your bag is empty.",
  unavailable: "Someone has just bought one of your pieces. Your bag shows which; change it and place the order again.",
  over_cod_limit: "This order is over our cash-on-delivery limit. Please message us and we'll arrange it.",
  pincode: "We can't deliver to this pincode with cash on delivery yet. Please message us.",
  too_many_unverified: `This number already has ${MAX_UNVERIFIED_COD} orders waiting for our call. We'll confirm those first; message us if this is urgent.`,
};

export async function placeOrderAction(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const values = Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));
  const parsed = parseCheckoutForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const bag = await findBag(db, (await cookies()).get(BAG_COOKIE)?.value);
  if (!bag) return { errors: {}, message: MESSAGES.empty, values };

  let placed;
  try {
    placed = await placeCodOrder(db, bag.id, parsed.data);
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { errors: {}, message: MESSAGES[err.code], bagChanged: err.code === "unavailable", values };
    }
    throw err;
  }

  // Stock changed: the shop's sold-out marks and counts must follow.
  updateTag(CATALOG_TAG);
  redirect(orderPath(placed.orderNumber, orderLinkKey(placed.orderId, env().BETTER_AUTH_SECRET)));
}
