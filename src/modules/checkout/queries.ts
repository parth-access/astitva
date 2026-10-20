import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { storeSettings } from "@/db/schema";
import { SETTINGS_TAG } from "@/modules/catalog/queries";
import type { PricingSettings } from "./pricing";

export type CheckoutSettings = PricingSettings & { codEnabled: boolean; codMaxOrderMinor: number };

/** For display (the bag and checkout pages). Placing an order re-reads the settings under lock. */
export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);

  const [s] = await db
    .select({
      codEnabled: storeSettings.codEnabled,
      codMaxOrderMinor: storeSettings.codMaxOrderMinor,
      codFeeMinor: storeSettings.codFeeMinor,
      shippingFlatMinor: storeSettings.shippingFlatMinor,
      freeShippingThresholdMinor: storeSettings.freeShippingThresholdMinor,
    })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));
  return {
    codEnabled: s?.codEnabled ?? false,
    codMaxOrderMinor: Number(s?.codMaxOrderMinor ?? 500_000),
    codFeeMinor: Number(s?.codFeeMinor ?? 0),
    shippingFlatMinor: Number(s?.shippingFlatMinor ?? 0),
    freeShippingThresholdMinor: s?.freeShippingThresholdMinor == null ? null : Number(s.freeShippingThresholdMinor),
  };
}
