import { describe, expect, it } from "vitest";
import { displayName } from "@/lib/format";

describe("displayName", () => {
  it("sets a name typed in capitals in title case", () => {
    expect(displayName("THE MUSE KNIT")).toBe("The Muse Knit");
    expect(displayName("THE CROCHET SWEATER (WOMEN'S)")).toBe("The Crochet Sweater (Women's)");
    expect(displayName("FEELIN' GOOD")).toBe("Feelin' Good");
  });

  it("leaves mixed-case names exactly as typed", () => {
    expect(displayName("Saanjh")).toBe("Saanjh");
    expect(displayName("The ABC Edit")).toBe("The ABC Edit");
  });

  it("passes through empty names", () => {
    expect(displayName(null)).toBeNull();
    expect(displayName("Nº 01")).toBe("Nº 01");
  });
});
