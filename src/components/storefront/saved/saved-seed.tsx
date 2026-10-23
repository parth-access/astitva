import { db } from "@/db/client";
import { listSavedIds } from "@/modules/account/saved";
import { getCustomer } from "@/modules/auth/customer";
import { SeedSaved } from "./saved-context";

/** Reads the signed-in customer's hearts on the server (inside Suspense: it depends on the session). */
export async function SavedSeed() {
  const customer = await getCustomer();
  return <SeedSaved ids={customer ? await listSavedIds(db, customer.id) : []} />;
}
