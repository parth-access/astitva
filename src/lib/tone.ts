/**
 * A piece's "tone" is its dominant colour (hex). It sits behind photographs
 * while they load, and stands in for them until they exist.
 */

const HEX = /^#([0-9a-f]{6})$/i;
export const DEFAULT_TONE = "#d9c7ad";

export function normaliseTone(tone: string | null | undefined): string {
  return tone && HEX.test(tone) ? tone.toLowerCase() : DEFAULT_TONE;
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const h = normaliseTone(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** Text colour that reads on top of the tone: ivory on dark tones, espresso on light ones. */
export function inkOn(tone: string): "light" | "dark" {
  return luminance(tone) < 0.18 ? "light" : "dark";
}
