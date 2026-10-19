/** "Nº 07" (with a non-breaking space). Two digits until the house passes 99 pieces, then three. */
export function formatPieceNumber(n: number): string {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`Invalid piece number: ${n}`);
  return `Nº\u00a0${String(n).padStart(n > 99 ? 3 : 2, "0")}`;
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Chapter numbers are shown in Roman numerals: Chapter I, Chapter II… */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) throw new RangeError(`Cannot write ${n} in Roman numerals`);
  let out = "";
  let rest = n;
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** Letter text is stored with blank lines between paragraphs. */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** First sentence, for captions. Falls back to a word-boundary cut. */
export function firstSentence(text: string | null | undefined, max = 140): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const end = t.search(/[.!?](\s|$)/);
  const sentence = end >= 0 ? t.slice(0, end + 1) : t;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const longDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const monthYear = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function formatLongDate(d: Date): string {
  return longDate.format(d);
}

export function formatMonthYear(d: Date): string {
  return monthYear.format(d);
}

/**
 * wa.me link that opens WhatsApp with a message already typed.
 * `phone` is digits only with country code (validated in the database).
 */
export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
