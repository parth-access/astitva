import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { storeSettings } from "@/db/schema";

/**
 * Where a reply to one of our emails goes: the support address in the admin's
 * settings. The domain we send from has no mailbox, so without this a reply bounces.
 */
export async function replyToAddress(db: DbOrTx): Promise<string | undefined> {
  const [s] = await db.select({ email: storeSettings.supportEmail }).from(storeSettings).where(eq(storeSettings.id, 1));
  return s?.email ?? undefined;
}
