import { describe, expect, it } from "vitest";
import { allocateDiscount, divRoundHalfUp, formatINR, percentOf, rupeesToPaise } from "@/lib/money";

describe("money", () => {
  it("formats paise as Indian rupees with lakh grouping", () => {
    expect(formatINR(12_499_900)).toBe("₹1,24,999");
    expect(formatINR(249_950)).toBe("₹2,499.50");
    expect(formatINR(0)).toBe("₹0");
  });

  it("parses admin rupee input without floating point error", () => {
    expect(rupeesToPaise("2499")).toBe(249_900);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("19.99")).toBe(1_999);
    expect(() => rupeesToPaise("12.345")).toThrow();
    expect(() => rupeesToPaise("-5")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });

  it("rounds half up", () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(4, 2)).toBe(2);
    expect(divRoundHalfUp(1, 3)).toBe(0);
    expect(percentOf(1_999, 1_000)).toBe(200); // 10% of ₹19.99 = 199.9 paise → 200
  });

  it("allocates a discount so the parts always sum exactly", () => {
    expect(allocateDiscount([100, 100, 100], 100)).toEqual([33, 33, 34]);
    expect(allocateDiscount([249_900, 0, 99_900], 10_000).reduce((s, p) => s + p, 0)).toBe(10_000);
    expect(allocateDiscount([500], 500)).toEqual([500]);
    expect(allocateDiscount([300, 200], 0)).toEqual([0, 0]);
    expect(() => allocateDiscount([100], 101)).toThrow();
  });

  it("never gives a line more discount than its amount (property check)", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 2_000; i++) {
      const lines = Array.from({ length: 1 + rand(6) }, () => rand(500_000));
      const total = lines.reduce((s, a) => s + a, 0);
      const discount = total === 0 ? 0 : rand(total + 1);
      const parts = allocateDiscount(lines, discount);
      expect(parts.reduce((s, p) => s + p, 0)).toBe(discount);
      parts.forEach((p, j) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(lines[j]!);
      });
    }
  });
});

