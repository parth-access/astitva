import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storeSettings } from "@/db/schema";
import { SETTINGS_TAG } from "@/modules/catalog/queries";
import type { PricingSettings } from "./pricing";

export type CheckoutSettings = PricingSettings & { holdMinutes: number };

/** For display (the bag and checkout pages). Placing an order re-reads the settings under lock. */
export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);

  const [s] = await db
    .select({
      shippingFlatMinor: storeSettings.shippingFlatMinor,
      freeShippingThresholdMinor: storeSettings.freeShippingThresholdMinor,
      holdMinutes: storeSettings.reservationTtlMinutes,
    })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));
  return {
    shippingFlatMinor: Number(s?.shippingFlatMinor ?? 0),
    freeShippingThresholdMinor: s?.freeShippingThresholdMinor == null ? null : Number(s.freeShippingThresholdMinor),
    holdMinutes: s?.holdMinutes ?? 15,
  };
}
