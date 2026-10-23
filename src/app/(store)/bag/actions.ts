"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { currentBag, openCurrentBag } from "@/modules/bag/current";
import { addToBag, BagError, EMPTY_BAG, readBag, removeLine, setLineQuantity, type Bag } from "@/modules/bag/service";
import { getStorefront } from "@/modules/catalog/queries";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";

export type BagResult = { bag: Bag; error?: string };

const id = z.uuid();

function message(err: unknown): string {
  if (err instanceof BagError) {
    if (err.code === "not_enough") return err.available > 0 ? `Only ${err.available} left, and they're in your bag.` : "Someone has just taken the last one.";
    if (err.code === "limit") return `Up to ${err.available} of one piece per order.`;
    if (err.code === "unavailable") return "This piece is no longer offered.";
  }
  throw err;
}

/** Bag edits refuse while ordering is closed, whatever the page showed, and when a visitor is making too many. */
async function guard(): Promise<string | null> {
  const { orderingOpen } = await getStorefront();
  if (!orderingOpen) return "Ordering opens soon.";
  if (!(await allowRequest(LIMITS.bag))) return "That's a lot of changes in a short time. Please wait a few minutes.";
  return null;
}

export async function addToBagAction(variantId: string, quantity = 1): Promise<BagResult> {
  if (!id.safeParse(variantId).success) return { bag: EMPTY_BAG, error: "That piece isn't available." };
  const closed = await guard();
  if (closed) {
    // No new bag for a refused request.
    const existing = await currentBag();
    return { bag: existing ? await readBag(db, existing.id) : EMPTY_BAG, error: closed };
  }
  const bag = await openCurrentBag();
  try {
    await addToBag(db, bag.id, variantId, Math.max(1, Math.min(10, Math.trunc(quantity))));
    return { bag: await readBag(db, bag.id) };
  } catch (err) {
    return { bag: await readBag(db, bag.id), error: message(err) };
  }
}

export async function setBagQuantityAction(lineId: string, quantity: number): Promise<BagResult> {
  const bag = await currentBag();
  if (!bag || !id.safeParse(lineId).success) return { bag: EMPTY_BAG };
  const closed = await guard();
  if (closed) return { bag: await readBag(db, bag.id), error: closed };
  try {
    await setLineQuantity(db, bag.id, lineId, Math.max(0, Math.trunc(quantity)));
    return { bag: await readBag(db, bag.id) };
  } catch (err) {
    return { bag: await readBag(db, bag.id), error: message(err) };
  }
}

export async function removeFromBagAction(lineId: string): Promise<BagResult> {
  const bag = await currentBag();
  if (!bag || !id.safeParse(lineId).success) return { bag: EMPTY_BAG };
  await removeLine(db, bag.id, lineId);
  return { bag: await readBag(db, bag.id) };
}

/** For a page that needs the latest stock in the bag (opening the drawer after a while). */
export async function refreshBagAction(): Promise<Bag> {
  const bag = await currentBag();
  return bag ? readBag(db, bag.id) : EMPTY_BAG;
}
