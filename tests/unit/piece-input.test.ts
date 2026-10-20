import { describe, expect, it } from "vitest";
import { paiseToRupeesText, rupeesToPaise } from "@/lib/money";
import { slugify } from "@/modules/catalog-admin/fields";
import { parsePieceForm } from "@/modules/catalog-admin/input";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const base = {
  pieceNumber: "7",
  pieceName: "Neem",
  name: "Olive linen wrap dress",
  "v.0.priceMinor": "3,499",
  "v.0.isActive": "on",
  "v.0.initialStock": "1",
};

describe("piece form", () => {
  it("parses rupees to paise, makes the web address and drops blank fields", () => {
    const r = parsePieceForm(form({ ...base, tone: "#6B6B46", story: "  ", "v.0.bustCm": "96" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.slug).toBe("neem-olive-linen-wrap-dress");
    expect(r.data.tone).toBe("#6b6b46");
    expect(r.data.story).toBeNull();
    expect(r.data.variants[0]).toMatchObject({ priceMinor: 349_900, isActive: true, initialStock: 1, measurements: { bustCm: 96 } });
  });

  it("keys errors by field so the form can show them in place", () => {
    const r = parsePieceForm(
      form({ ...base, name: "", "v.0.priceMinor": "abc", "v.3.priceMinor": "100", "v.3.compareAtMinor": "90", tone: "olive" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["name", "tone", "v.0.priceMinor", "v.3.compareAtMinor"]);
  });

  it("reads an unticked On sale box as off", () => {
    const r = parsePieceForm(form({ ...base, "v.0.isActive": "" }));
    expect(r.ok && r.data.variants[0]!.isActive).toBe(false);
    const missing = { ...base } as Record<string, string>;
    delete missing["v.0.isActive"];
    const r2 = parsePieceForm(form(missing));
    expect(r2.ok && r2.data.variants[0]!.isActive).toBe(false);
  });

  it("strips accents and punctuation from web addresses", () => {
    expect(slugify("Saañjh", "Taupe knit, midi dress!")).toBe("saanjh-taupe-knit-midi-dress");
  });

  it("round-trips paise through the rupee text the editor shows", () => {
    for (const p of [0, 100, 349_900, 349_950, 5]) expect(rupeesToPaise(paiseToRupeesText(p))).toBe(p);
    expect(paiseToRupeesText(349_950)).toBe("3499.50");
  });
});
