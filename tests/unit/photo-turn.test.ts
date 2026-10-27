import { describe, expect, it } from "vitest";
import { turnFrames, type PhotoAngle } from "../../src/lib/photo-turn";

const photo = (angle: PhotoAngle | null, url = `${angle}.jpg`) => ({ url, alt: "", angle });

describe("turning a piece round from its photos", () => {
  it("needs the front, a side and the back", () => {
    expect(turnFrames([photo("front"), photo("side")])).toBeNull();
    expect(turnFrames([photo("front"), photo("back"), photo(null, "detail.jpg")])).toBeNull();
    expect(turnFrames([])).toBeNull();
  });

  it("goes front, side, back, then the side mirrored when there's no other side", () => {
    const frames = turnFrames([photo("back"), photo(null, "detail.jpg"), photo("side"), photo("front")])!;
    expect(frames.map((f) => [f.angle, f.url, f.mirrored])).toEqual([
      ["front", "front.jpg", false],
      ["side", "side.jpg", false],
      ["back", "back.jpg", false],
      ["other_side", "side.jpg", true],
    ]);
  });

  it("uses a real photo of the other side when there is one", () => {
    const frames = turnFrames([photo("front"), photo("side"), photo("back"), photo("other_side")])!;
    expect(frames[3]).toMatchObject({ url: "other_side.jpg", mirrored: false });
  });
});
