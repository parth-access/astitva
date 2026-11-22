import { describe, expect, it } from "vitest";
import { choosePieces, storyLine } from "@/components/storefront/editorial-break";
import type { PieceCard } from "@/modules/catalog/queries";

describe("editorial breaks in the shop", () => {
  it("quotes the story's first sentence", () => {
    expect(storyLine("Some colours never need an introduction. The Muse Knit is a celebration.")).toBe("Some colours never need an introduction.");
    expect(storyLine("Easy over a camisole.")).toBe("Easy over a camisole.");
    expect(storyLine("  A line\n with  breaks!  And more.")).toBe("A line with breaks!");
  });

  it("skips a story with nothing short enough to set large", () => {
    expect(storyLine(null)).toBeNull();
    expect(storyLine("   ")).toBeNull();
    expect(storyLine(`${"word ".repeat(40)}end.`)).toBeNull();
  });

  it("spreads the chosen pieces through the list, never twice", () => {
    const pieces = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }) as PieceCard);
    const two = choosePieces(pieces, 2).map((p) => p.id);
    expect(two).toEqual(["3", "8"]);
    expect(new Set(choosePieces(pieces, 10).map((p) => p.id)).size).toBe(10);
    expect(choosePieces(pieces.slice(0, 1), 3)).toHaveLength(1);
    expect(choosePieces([], 2)).toEqual([]);
  });
});
