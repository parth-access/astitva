import { describe, expect, it } from "vitest";
import { firstSentence, formatPieceNumber, paragraphs, toRoman, whatsappLink } from "@/lib/format";
import { inkOn, normaliseTone } from "@/lib/tone";

describe("brand formatting", () => {
  it("numbers pieces like a catalogue", () => {
    expect(formatPieceNumber(7)).toBe("Nº\u00a007");
    expect(formatPieceNumber(18)).toBe("Nº\u00a018");
    expect(formatPieceNumber(124)).toBe("Nº\u00a0124");
    expect(() => formatPieceNumber(0)).toThrow();
  });

  it("writes chapter numbers in Roman numerals", () => {
    expect([1, 2, 4, 9, 14, 40].map(toRoman)).toEqual(["I", "II", "IV", "IX", "XIV", "XL"]);
  });

  it("splits a letter into paragraphs on blank lines", () => {
    expect(paragraphs("One.\n\nTwo\nstill two.\n\n\n  Three. ")).toEqual(["One.", "Two\nstill two.", "Three."]);
    expect(paragraphs(null)).toEqual([]);
  });

  it("takes the first sentence for captions", () => {
    expect(firstSentence("Found at dusk. Soft linen.")).toBe("Found at dusk.");
    expect(firstSentence("")).toBeNull();
    const long = firstSentence("word ".repeat(60), 40)!;
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith("…")).toBe(true);
  });

  it("builds a WhatsApp link with the message encoded", () => {
    expect(whatsappLink("919812345678", "Hi, about Nº 07 Saanjh & fit?")).toBe(
      "https://wa.me/919812345678?text=Hi%2C%20about%20N%C2%BA%2007%20Saanjh%20%26%20fit%3F",
    );
  });
});

describe("tones", () => {
  it("falls back to a neutral tone for missing or invalid values", () => {
    expect(normaliseTone(null)).toBe("#d9c7ad");
    expect(normaliseTone("red")).toBe("#d9c7ad");
    expect(normaliseTone("#ABCDEF")).toBe("#abcdef");
  });

  it("puts light ink on dark tones and dark ink on light ones", () => {
    expect(inkOn("#5b1a2a")).toBe("light"); // Jamun
    expect(inkOn("#3d2a22")).toBe("light"); // Kahwa
    expect(inkOn("#e9e1d0")).toBe("dark"); // Chandni
    expect(inkOn("#cdb592")).toBe("dark"); // Mitti
  });
});
