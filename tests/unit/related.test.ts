import { describe, expect, it } from "vitest";
import { pickRelated } from "../../src/modules/catalog/related";

const piece = (id: string, categorySlug: string | null, onHand = 3) => ({ id, categorySlug, onHand });
const order = ["dresses", "tops", "jeans", "outerwear"];

describe("you might also like", () => {
  it("shows other pieces from the same category, in the shop's order, never the piece itself", () => {
    const pieces = [piece("d1", "dresses"), piece("t1", "tops"), piece("d2", "dresses"), piece("d3", "dresses"), piece("d4", "dresses"), piece("d5", "dresses")];
    expect(pickRelated(piece("d1", "dresses"), pieces, order).map((p) => p.id)).toEqual(["d2", "d3", "d4", "d5"]);
  });

  it("tops up from the next category, then the one after", () => {
    const pieces = [piece("j1", "jeans"), piece("o1", "outerwear"), piece("t1", "tops"), piece("t2", "tops"), piece("j2", "jeans"), piece("d1", "dresses")];
    expect(pickRelated(piece("t1", "tops"), pieces, order).map((p) => p.id)).toEqual(["t2", "j1", "j2", "o1"]);
  });

  it("wraps round from the last category to the first", () => {
    const pieces = [piece("d1", "dresses"), piece("o1", "outerwear"), piece("t1", "tops")];
    expect(pickRelated(piece("o1", "outerwear"), pieces, order).map((p) => p.id)).toEqual(["d1", "t1"]);
  });

  it("leaves out sold-out pieces, and puts pieces without a category last", () => {
    const pieces = [piece("x1", null), piece("d2", "dresses", 0), piece("t1", "tops"), piece("d3", "dresses")];
    expect(pickRelated(piece("d1", "dresses"), pieces, order).map((p) => p.id)).toEqual(["d3", "t1", "x1"]);
  });

  it("works for a piece without a category, in the shop's category order", () => {
    const pieces = [piece("j1", "jeans"), piece("d1", "dresses"), piece("x2", null)];
    expect(pickRelated(piece("x1", null), pieces, order).map((p) => p.id)).toEqual(["d1", "j1", "x2"]);
  });
});
