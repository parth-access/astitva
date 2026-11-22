import { describe, expect, it } from "vitest";
import { shopHref, sortCards, sortFrom, type SortKeys } from "@/lib/shop-sort";

const card = (id: string, at: number, priceMinor: number, publishedAt: number | null) => ({ id, keys: { at, priceMinor, publishedAt, name: id } satisfies SortKeys });
// Krishna's order: a, b, c, d.
const cards = [card("a", 0, 3000, 100), card("b", 1, 1000, null), card("c", 2, 3000, 300), card("d", 3, 2000, 200)];
const ids = (list: { id: string }[]) => list.map((c) => c.id).join("");

describe("shop sorting in the browser", () => {
  it("keeps Krishna's order by default, whatever order the cards come in", () => {
    expect(ids(sortCards([...cards].reverse(), "sequence"))).toBe("abcd");
  });

  it("sorts by price both ways, ties in Krishna's order", () => {
    expect(ids(sortCards(cards, "price_asc"))).toBe("bdac");
    expect(ids(sortCards(cards, "price_desc"))).toBe("acdb");
  });

  it("puts the newest first and never-published pieces last", () => {
    expect(ids(sortCards(cards, "newest"))).toBe("cdab");
  });

  it("reads only known sorts from the address", () => {
    expect(sortFrom("price_asc")).toBe("price_asc");
    expect(sortFrom(["newest", "price_asc"])).toBe("newest");
    expect(sortFrom("drop table")).toBe("sequence");
    expect(sortFrom(null)).toBe("sequence");
  });

  it("leaves the default order out of the address", () => {
    expect(shopHref("dresses")).toBe("/shop/dresses");
    expect(shopHref(undefined, "newest")).toBe("/shop?sort=newest");
  });
});
