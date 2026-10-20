import { describe, expect, it } from "vitest";
import { formatMobile, normaliseMobile } from "../../src/lib/india";
import { parseCheckoutForm } from "../../src/modules/checkout/input";
import { discountOn, priceOrder, untilFreeShipping } from "../../src/modules/checkout/pricing";
import { isOrderLinkKey, orderLinkKey } from "../../src/modules/orders/links";

describe("priceOrder", () => {
  const settings = { shippingFlatMinor: 9_900, freeShippingThresholdMinor: 500_000, codFeeMinor: 5_000 };

  it("adds shipping and the COD fee below the free-shipping line", () => {
    expect(priceOrder([{ unitPriceMinor: 349_900, quantity: 1 }], settings, "cod")).toEqual({
      subtotalMinor: 349_900,
      discountMinor: 0,
      shippingMinor: 9_900,
      codFeeMinor: 5_000,
      totalMinor: 364_800,
    });
  });

  it("ships free at the line, and charges no COD fee online", () => {
    expect(priceOrder([{ unitPriceMinor: 250_000, quantity: 2 }], settings, "online")).toEqual({
      subtotalMinor: 500_000,
      discountMinor: 0,
      shippingMinor: 0,
      codFeeMinor: 0,
      totalMinor: 500_000,
    });
  });

  it("takes a discount off the pieces, and judges free shipping after it", () => {
    // 10% off ₹5,000 is ₹4,500: below the ₹5,000 line, so shipping is charged again.
    expect(priceOrder([{ unitPriceMinor: 250_000, quantity: 2 }], settings, "cod", { kind: "percent", value: 1000 })).toEqual({
      subtotalMinor: 500_000,
      discountMinor: 50_000,
      shippingMinor: 9_900,
      codFeeMinor: 5_000,
      totalMinor: 464_900,
    });
    // A fixed amount never takes more than the pieces cost.
    expect(priceOrder([{ unitPriceMinor: 30_000, quantity: 1 }], settings, "online", { kind: "amount", value: 50_000 })).toMatchObject({
      discountMinor: 30_000,
      totalMinor: 9_900,
    });
    // 15% of ₹3,499 is ₹524.85: rounded to ₹525.
    expect(discountOn(349_900, { kind: "percent", value: 1500 })).toBe(52_500);
    expect(discountOn(349_900, { kind: "percent", value: 1000 })).toBe(35_000);
  });

  it("refuses fractions of paise and empty quantities", () => {
    expect(() => priceOrder([{ unitPriceMinor: 10.5, quantity: 1 }], settings, "cod")).toThrow();
    expect(() => priceOrder([{ unitPriceMinor: 100, quantity: 0 }], settings, "cod")).toThrow();
  });

  it("says how far from free shipping, only when there is a charge to avoid", () => {
    expect(untilFreeShipping(349_900, settings)).toBe(150_100);
    expect(untilFreeShipping(600_000, settings)).toBeNull();
    expect(untilFreeShipping(100, { ...settings, shippingFlatMinor: 0 })).toBeNull();
  });
});

describe("mobile numbers", () => {
  it("accepts the ways people type them", () => {
    for (const typed of ["9812345678", "+91 98123 45678", "098123-45678", "91 9812345678"]) expect(normaliseMobile(typed)).toBe("9812345678");
  });
  it("refuses landlines and short numbers", () => {
    for (const typed of ["0130 2212345", "12345", "5812345678"]) expect(normaliseMobile(typed)).toBeNull();
  });
  it("formats for reading", () => {
    expect(formatMobile("9812345678")).toBe("+91 98123 45678");
  });
});

describe("parseCheckoutForm", () => {
  const valid = {
    name: "Asha Rao",
    phone: "+91 98123 45678",
    email: "",
    line1: "12 Model Town",
    city: "Sonipat",
    state: "Haryana",
    pincode: "131001",
    payment: "cod",
    key: "6f1c0a52-7d0e-4c4f-9d8e-2b1f0a3c5d7e",
  };
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };

  it("builds the address snapshot", () => {
    const r = parseCheckoutForm(form(valid));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.contact).toEqual({ name: "Asha Rao", phone: "9812345678", email: null });
    expect(r.data.address).toEqual({
      recipientName: "Asha Rao",
      phone: "9812345678",
      line1: "12 Model Town",
      city: "Sonipat",
      state: "Haryana",
      pincode: "131001",
      countryCode: "IN",
    });
  });

  it("reports every bad field at once", () => {
    const r = parseCheckoutForm(form({ ...valid, phone: "123", pincode: "01234", state: "Narnia", name: " " }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["name", "phone", "pincode", "state"]);
  });

  it("ignores any amount sent with the form", () => {
    const r = parseCheckoutForm(form({ ...valid, totalMinor: "1" }));
    expect(r.ok && "totalMinor" in r.data).toBe(false);
  });
});

describe("order links", () => {
  it("opens only with the order's own key", () => {
    const key = orderLinkKey("order-a", "s".repeat(32));
    expect(isOrderLinkKey("order-a", key, "s".repeat(32))).toBe(true);
    expect(isOrderLinkKey("order-b", key, "s".repeat(32))).toBe(false);
    expect(isOrderLinkKey("order-a", key, "t".repeat(32))).toBe(false);
    expect(isOrderLinkKey("order-a", null, "s".repeat(32))).toBe(false);
  });
});
