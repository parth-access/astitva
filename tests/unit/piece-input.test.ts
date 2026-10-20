import { describe, expect, it } from "vitest";
import { paiseToRupeesText, rupeesToPaise } from "@/lib/money";
import { slugify } from "@/modules/catalog-admin/fields";
import { parsePieceForm } from "@/modules/catalog-admin/input";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

/** Two colours × two sizes; Ink isn't made in L. */
const base = {
  pieceNumber: "7",
  pieceName: "Neem",
  name: "Linen wrap dress",
  priceMinor: "3,499",
  "c.0.name": "Sage",
  "c.0.hex": "#8A8F6A",
  "c.4.name": "Ink",
  "c.4.hex": "",
  "s.0.name": "M",
  "s.0.bustCm": "94",
  "s.2.name": "L",
  "stock.0.0": "2",
  "stock.0.2": "0",
  "stock.4.0": "1",
  "stock.4.2": "",
};

describe("piece form", () => {
  it("reads colours, sizes and a stock grid, with blank meaning not made", () => {
    const r = parsePieceForm(form(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.slug).toBe("neem-linen-wrap-dress");
    expect(r.data.priceMinor).toBe(349_900);
    expect(r.data.colours).toEqual([
      { name: "Sage", hex: "#8a8f6a", was: null },
      { name: "Ink", hex: null, was: null },
    ]);
    expect(r.data.sizes.map((s) => [s.name, s.measurements])).toEqual([
      ["M", { bustCm: 94 }],
      ["L", null],
    ]);
    expect(r.data.stock).toEqual([
      [2, 0],
      [1, null],
    ]);
  });

  it("keys errors by the field the editor shows", () => {
    const r = parsePieceForm(
      form({ ...base, name: "", priceMinor: "abc", "c.4.name": "sage", "stock.0.2": "-1", compareAtMinor: "100" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["c.4.name", "name", "priceMinor", "stock.0.2"]);
    expect(r.errors["c.4.name"]).toMatch(/Two colours/);
  });

  it("allows a single unnamed colour and size, but needs some stock", () => {
    const one = { name: "Shawl", priceMinor: "1999", "c.0.name": "", "s.0.name": "", "stock.0.0": "" };
    const empty = parsePieceForm(form(one));
    expect(!empty.ok && empty.errors.stock).toMatch(/at least one/);
    const ok = parsePieceForm(form({ ...one, "stock.0.0": "3" }));
    expect(ok.ok && ok.data.stock).toEqual([[3]]);
  });

  it("strips accents and punctuation from web addresses", () => {
    expect(slugify("Saañjh", "Taupe knit, midi dress!")).toBe("saanjh-taupe-knit-midi-dress");
  });

  it("round-trips paise through the rupee text the editor shows", () => {
    for (const p of [0, 100, 349_900, 349_950, 5]) expect(rupeesToPaise(paiseToRupeesText(p))).toBe(p);
    expect(paiseToRupeesText(349_950)).toBe("3499.50");
  });
});
