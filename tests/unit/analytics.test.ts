import { describe, expect, it } from "vitest";
import { cleanReferrer, cleanUrl, gaItem, gaRupees } from "../../src/lib/analytics";

const origin = "https://astitva.store";

describe("what Analytics may see", () => {
  it("drops an order's private key and reports every order page as one page", () => {
    expect(cleanUrl(`${origin}/orders/AST-001006?k=secret-key`, origin)).toBe(`${origin}/orders/[number]`);
  });

  it("keeps the shop's filters and campaign tags, and drops everything else", () => {
    expect(cleanUrl(`${origin}/shop?category=dresses&sort=price&utm_source=instagram&next=%2Faccount&email=a%40b.c`, origin)).toBe(
      `${origin}/shop?category=dresses&sort=price&utm_source=instagram`,
    );
    expect(cleanUrl(`${origin}/pieces/neem?colour=Sage#size`, origin)).toBe(`${origin}/pieces/neem?colour=Sage`);
  });

  it("never passes on another site's address beyond its origin", () => {
    expect(cleanUrl("https://evil.example/path?x=1", origin)).toBe("https://evil.example");
    expect(cleanReferrer("https://www.instagram.com/p/abc?igsh=1", origin)).toBe("https://www.instagram.com/");
    expect(cleanReferrer(`${origin}/orders/AST-001006?k=secret`, origin)).toBe(`${origin}/orders/[number]`);
    expect(cleanReferrer("", origin)).toBe("");
  });

  it("reports paise as rupees and names items the same way everywhere", () => {
    expect(gaRupees(349_950)).toBe(3499.5);
    expect(gaItem({ slug: "neem", name: "Neem", category: "dresses", colour: "Sage", size: "M", priceMinor: 349_900, quantity: 2 })).toEqual({
      item_id: "neem",
      item_name: "Neem",
      item_brand: "Astitva",
      item_category: "dresses",
      item_variant: "Sage / M",
      price: 3499,
      quantity: 2,
    });
    expect(gaItem({ slug: "neem", name: "Neem", priceMinor: 100 })).not.toHaveProperty("item_variant");
  });
});
