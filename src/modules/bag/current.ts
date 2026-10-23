import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCustomer } from "@/modules/auth/customer";
import { BAG_COOKIE, BAG_DAYS, claimGuestBag, findAccountBag, findBag, openAccountBag, openBag } from "./service";

/**
 * The bag for this request: the signed-in customer's, else the guest bag in
 * the cookie. A guest bag still in the cookie of a signed-in customer joins
 * their account's first (just after signing in, on any sign-in route).
 */

async function token() {
  return (await cookies()).get(BAG_COOKIE)?.value ?? null;
}

/**
 * Server actions only: cookies can't be changed while a page renders. After
 * the guest bag joins the account, its cookie points at nothing.
 */
async function forgetToken() {
  try {
    (await cookies()).delete(BAG_COOKIE);
  } catch {
    // Rendering a page: the cookie stays until the next action, and finds nothing.
  }
}

export async function currentBag(): Promise<{ id: string } | null> {
  const customer = await getCustomer();
  const t = await token();
  if (!customer) return findBag(db, t);
  if (await claimGuestBag(db, t, customer.id)) await forgetToken();
  return findAccountBag(db, customer.id);
}

/** As currentBag, made on first use. */
export async function openCurrentBag(): Promise<{ id: string }> {
  const customer = await getCustomer();
  const t = await token();
  if (customer) {
    if (await claimGuestBag(db, t, customer.id)) await forgetToken();
    return openAccountBag(db, customer.id);
  }
  const bag = await openBag(db, t);
  if (bag.newToken) {
    (await cookies()).set(BAG_COOKIE, bag.newToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: BAG_DAYS * 86_400,
    });
  }
  return { id: bag.id };
}
