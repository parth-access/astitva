"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import {
  addToBag,
  BAG_COOKIE,
  BAG_DAYS,
  BagError,
  EMPTY_BAG,
  findBag,
  openBag,
  readBag,
  removeLine,
  setLineQuantity,
  type Bag,
} from "@/modules/bag/service";
import { getStorefront } from "@/modules/catalog/queries";

export type BagResult = { bag: Bag; error?: string };

const id = z.uuid();

async function currentToken() {
  return (await cookies()).get(BAG_COOKIE)?.value ?? null;
}

async function setToken(token: string) {
  (await cookies()).set(BAG_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BAG_DAYS * 86_400,
  });
}

function message(err: unknown): string {
  if (err instanceof BagError) {
    if (err.code === "not_enough") return err.available > 0 ? `Only ${err.available} left, and they're in your bag.` : "Someone has just taken the last one.";
    if (err.code === "limit") return `Up to ${err.available} of one piece per order.`;
    if (err.code === "unavailable") return "This piece is no longer offered.";
  }
  throw err;
}

/** Bag edits refuse while ordering is closed, whatever the page showed. */
async function guard(): Promise<string | null> {
  const { orderingOpen } = await getStorefront();
  return orderingOpen ? null : "Ordering opens soon.";
}

export async function addToBagAction(variantId: string, quantity = 1): Promise<BagResult> {
  if (!id.safeParse(variantId).success) return { bag: EMPTY_BAG, error: "That piece isn't available." };
  const closed = await guard();
  const bag = await openBag(db, await currentToken());
  if (bag.newToken) await setToken(bag.newToken);
  if (closed) return { bag: await readBag(db, bag.id), error: closed };
  try {
    await addToBag(db, bag.id, variantId, Math.max(1, Math.min(10, Math.trunc(quantity))));
    return { bag: await readBag(db, bag.id) };
  } catch (err) {
    return { bag: await readBag(db, bag.id), error: message(err) };
  }
}

export async function setBagQuantityAction(lineId: string, quantity: number): Promise<BagResult> {
  const bag = await findBag(db, await currentToken());
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
  const bag = await findBag(db, await currentToken());
  if (!bag || !id.safeParse(lineId).success) return { bag: EMPTY_BAG };
  await removeLine(db, bag.id, lineId);
  return { bag: await readBag(db, bag.id) };
}

/** For a page that needs the latest stock in the bag (opening the drawer after a while). */
export async function refreshBagAction(): Promise<Bag> {
  const bag = await findBag(db, await currentToken());
  return bag ? readBag(db, bag.id) : EMPTY_BAG;
}
