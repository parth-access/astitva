import { describe, expect, it } from "vitest";
import { chooseContents } from "@/modules/catalog/contents";

const pieces = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((p) => p.id);
/** Always draws the first piece left: makes the random fill predictable. */
const first = () => 0;

describe("the Contents page's three pieces", () => {
  it("shows the chosen pieces, in the order chosen", () => {
    expect(ids(chooseContents(pieces, ["d", "a", "c"], first))).toEqual(["d", "a", "c"]);
  });

  it("fills places left empty at random from the rest, never repeating", () => {
    expect(ids(chooseContents(pieces, ["d"], first))).toEqual(["d", "a", "b"]);
    expect(ids(chooseContents(pieces, [], () => 0.99))).toEqual(["e", "d", "c"]);
    expect(new Set(ids(chooseContents(pieces, ["b"]))).size).toBe(3);
  });

  it("skips a chosen piece that's no longer published, and a piece chosen twice", () => {
    expect(ids(chooseContents(pieces, ["gone", "b", "b"], first))).toEqual(["b", "a", "c"]);
  });

  it("shows what there is when there are fewer than three pieces", () => {
    expect(ids(chooseContents(pieces.slice(0, 2), [], first))).toEqual(["a", "b"]);
    expect(chooseContents([], ["a"])).toEqual([]);
  });
});
