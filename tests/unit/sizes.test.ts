import { describe, expect, it } from "vitest";
import { compareSizes } from "@/lib/sizes";

describe("sizes", () => {
  it("sorts letter sizes in wearing order, then numbers", () => {
    expect(["L", "M", "XS", "S", "XL"].sort(compareSizes)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(["40", "36", "M", null, "38"].sort(compareSizes)).toEqual(["M", "36", "38", "40", null]);
  });
});
