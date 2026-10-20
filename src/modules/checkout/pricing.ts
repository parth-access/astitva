import { assertNonNegativePaise, percentOf, type Paise } from "@/lib/money";

/** The store settings that decide what an order costs. */
export type PricingSettings = {
  shippingFlatMinor: Paise;
  /** Orders at or above this ship free. Null: the flat charge always applies. */
  freeShippingThresholdMinor: Paise | null;
  codFeeMinor: Paise;
};

export type OrderTotals = {
  subtotalMinor: Paise;
  discountMinor: Paise;
  shippingMinor: Paise;
  codFeeMinor: Paise;
  totalMinor: Paise;
};

/** A discount code's effect: a share of the pieces (basis points) or a fixed amount off them. */
export type DiscountRule = { kind: "percent" | "amount"; value: number };

/** What a rule takes off a subtotal: never more than the pieces cost. */
export function discountOn(subtotalMinor: Paise, rule: DiscountRule | null): Paise {
  if (!rule) return 0;
  // A percentage is rounded to whole rupees (₹3,149, not ₹3,149.10), half up.
  const off = rule.kind === "percent" ? Math.round(percentOf(subtotalMinor, rule.value) / 100) * 100 : rule.value;
  return Math.min(subtotalMinor, Math.max(0, off));
}

/**
 * What an order costs. Prices are tax-inclusive, so nothing is added for GST.
 * Called on the server with prices read from the database, never from the browser.
 */
export function priceOrder(
  lines: readonly { unitPriceMinor: Paise; quantity: number }[],
  settings: PricingSettings,
  method: "cod" | "online",
  discount: DiscountRule | null = null,
): OrderTotals {
  const subtotalMinor = lines.reduce((sum, l) => {
    assertNonNegativePaise(l.unitPriceMinor, "unit price");
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new RangeError(`Invalid quantity ${l.quantity}`);
    return sum + l.unitPriceMinor * l.quantity;
  }, 0);
  const discountMinor = discountOn(subtotalMinor, discount);
  // Free shipping is earned on what the pieces cost after the discount.
  const goods = subtotalMinor - discountMinor;
  const free = settings.freeShippingThresholdMinor !== null && goods >= settings.freeShippingThresholdMinor;
  const shippingMinor = subtotalMinor === 0 || free ? 0 : settings.shippingFlatMinor;
  const codFeeMinor = method === "cod" ? settings.codFeeMinor : 0;
  return { subtotalMinor, discountMinor, shippingMinor, codFeeMinor, totalMinor: goods + shippingMinor + codFeeMinor };
}

/** "₹X more for free shipping", as paise; null when not applicable. */
export function untilFreeShipping(subtotalMinor: Paise, settings: PricingSettings): Paise | null {
  if (settings.freeShippingThresholdMinor === null || settings.shippingFlatMinor === 0) return null;
  const gap = settings.freeShippingThresholdMinor - subtotalMinor;
  return gap > 0 ? gap : null;
}
