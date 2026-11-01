import { connection } from "next/server";
import { db } from "@/db/client";
import { listSavedIds } from "@/modules/account/saved";
import { getCustomer } from "@/modules/auth/customer";
import { currentBag } from "@/modules/bag/current";
import { readBag } from "@/modules/bag/service";
import { EMPTY_BAG } from "@/modules/bag/types";
import { getStorefront } from "@/modules/catalog/queries";

/**
 * This visitor's bag and hearts, which depend on their cookies. The browser
 * asks after the page has loaded, so shop pages themselves can be served from
 * the CDN without running any code.
 */
export async function GET() {
  await connection();
  const [{ orderingOpen }, customer] = await Promise.all([getStorefront(), getCustomer()]);
  const found = orderingOpen ? await currentBag() : null;
  const [bag, saved] = await Promise.all([found ? readBag(db, found.id) : EMPTY_BAG, customer ? listSavedIds(db, customer.id) : []]);
  return Response.json({ bag, saved }, { headers: { "cache-control": "private, no-store" } });
}
