import { describe, expect, it } from "vitest";
import { railGarments, type RailPhoto, type RailSide } from "../../src/lib/rail";

const shot = (color: string | null, side: RailSide = "front"): RailPhoto => ({ color, side, url: `${color}-${side}.png`, width: 900, height: 1200 });

describe("the clothing rail", () => {
  it("hangs every colour, in the piece's order, with its back when there is one", () => {
    const g = railGarments([{ name: "Cream" }, { name: "Black" }], [shot("Black"), shot("Cream"), shot("Cream", "back")]);
    expect(g?.map((x) => [x.colour, x.front.url, x.back?.url ?? null])).toEqual([
      ["Cream", "Cream-front.png", "Cream-back.png"],
      ["Black", "Black-front.png", null],
    ]);
  });

  it("isn't shown until every colour has its front", () => {
    expect(railGarments([{ name: "Cream" }, { name: "Black" }], [shot("Cream"), shot("Black", "back")])).toBeNull();
    expect(railGarments([], [])).toBeNull();
  });

  it("works for a piece in one unnamed colour", () => {
    expect(railGarments([{ name: null }], [shot(null)])?.[0]?.colour).toBeNull();
  });
});
