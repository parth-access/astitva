import { assertNonNegativePaise, type Paise } from "@/lib/money";

/** The store settings that decide what an order costs. */
export type PricingSettings = {
  shippingFlatMinor: Paise;
  /** Orders at or above this ship free. Null: the flat charge always applies. */
  freeShippingThresholdMinor: Paise | null;
  codFeeMinor: Paise;
};

export type OrderTotals = {
  subtotalMinor: Paise;
  shippingMinor: Paise;
  codFeeMinor: Paise;
  totalMinor: Paise;
};

/**
 * What an order costs. Prices are tax-inclusive, so nothing is added for GST.
 * Called on the server with prices read from the database, never from the browser.
 */
export function priceOrder(
  lines: readonly { unitPriceMinor: Paise; quantity: number }[],
  settings: PricingSettings,
  method: "cod" | "online",
): OrderTotals {
  const subtotalMinor = lines.reduce((sum, l) => {
    assertNonNegativePaise(l.unitPriceMinor, "unit price");
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new RangeError(`Invalid quantity ${l.quantity}`);
    return sum + l.unitPriceMinor * l.quantity;
  }, 0);
  const free = settings.freeShippingThresholdMinor !== null && subtotalMinor >= settings.freeShippingThresholdMinor;
  const shippingMinor = subtotalMinor === 0 || free ? 0 : settings.shippingFlatMinor;
  const codFeeMinor = method === "cod" ? settings.codFeeMinor : 0;
  return { subtotalMinor, shippingMinor, codFeeMinor, totalMinor: subtotalMinor + shippingMinor + codFeeMinor };
}

/** "₹X more for free shipping", as paise; null when not applicable. */
export function untilFreeShipping(subtotalMinor: Paise, settings: PricingSettings): Paise | null {
  if (settings.freeShippingThresholdMinor === null || settings.shippingFlatMinor === 0) return null;
  const gap = settings.freeShippingThresholdMinor - subtotalMinor;
  return gap > 0 ? gap : null;
}
