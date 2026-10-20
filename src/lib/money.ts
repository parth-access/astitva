/**
 * Money is always an integer number of paise (1 INR = 100 paise).
 * Never use floats for amounts. Customer-facing prices are tax-inclusive.
 *
 * JS numbers are exact for integers up to 2^53, i.e. ~9 × 10^13 rupees,
 * which is far beyond anything this store will see.
 */

export type Paise = number;

export function assertPaise(value: number, label = "amount"): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of paise, got ${value}`);
  }
}

export function assertNonNegativePaise(value: number, label = "amount"): asserts value is Paise {
  assertPaise(value, label);
  if (value < 0) throw new RangeError(`${label} must not be negative, got ${value}`);
}

/** Convert whole rupees (as typed in the admin) to paise. Accepts up to 2 decimals. */
export function rupeesToPaise(input: string | number): Paise {
  const text = typeof input === "number" ? input.toString() : input.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid rupee amount: "${text}"`);
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const paise = whole * 100 + fraction;
  assertNonNegativePaise(paise);
  return paise;
}

/** Paise as rupees for an input field: 349900 → "3499", 349950 → "3499.50". The inverse of rupeesToPaise. */
export function paiseToRupeesText(paise: Paise): string {
  assertNonNegativePaise(paise);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const withPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹1,24,999" style. Shows paise (two digits) only when present. */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : withPaise.format(paise / 100);
}

/**
 * Integer division rounding half away from zero for non-negative values
 * ("round half up" for the amounts we deal with).
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new RangeError("denominator must be positive");
  if (numerator < 0) throw new RangeError("numerator must be non-negative");
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Percentage given in basis points (1% = 100 bps), rounded half up. */
export function percentOf(amount: Paise, basisPoints: number): Paise {
  assertNonNegativePaise(amount);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError(`basisPoints must be an integer in [0, 10000], got ${basisPoints}`);
  }
  return divRoundHalfUp(amount * basisPoints, 10_000);
}

/**
 * Split an order-level discount across lines in proportion to each line's
 * amount. Rounds half up per line and puts the rounding remainder on the
 * last line with a non-zero amount, so the parts always sum exactly to
 * `discount` and no line discount exceeds its line amount.
 */
export function allocateDiscount(lineAmounts: readonly Paise[], discount: Paise): Paise[] {
  lineAmounts.forEach((a, i) => assertNonNegativePaise(a, `lineAmounts[${i}]`));
  assertNonNegativePaise(discount, "discount");
  const total = lineAmounts.reduce((s, a) => s + a, 0);
  if (discount > total) throw new RangeError("discount exceeds the sum of line amounts");
  if (discount === 0 || total === 0) return lineAmounts.map(() => 0);

  const parts = lineAmounts.map((a) => Math.min(a, divRoundHalfUp(a * discount, total)));
  let remainder = discount - parts.reduce((s, p) => s + p, 0);

  // Walk from the last line backwards absorbing the remainder (positive or
  // negative) without letting any part leave [0, lineAmount].
  for (let i = parts.length - 1; i >= 0 && remainder !== 0; i--) {
    const line = lineAmounts[i]!;
    const part = parts[i]!;
    if (remainder > 0) {
      const room = line - part;
      const take = Math.min(room, remainder);
      parts[i] = part + take;
      remainder -= take;
    } else {
      const give = Math.min(part, -remainder);
      parts[i] = part - give;
      remainder += give;
    }
  }
  return parts;
}
