const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "FREE", "ONE SIZE"];

/** Sort key for clothing sizes: letter sizes in wearing order, then numeric sizes, then anything else. */
export function sizeRank(size: string | null | undefined): [number, number, string] {
  if (!size) return [3, 0, ""];
  const s = size.trim().toUpperCase();
  const letter = LETTER_ORDER.indexOf(s);
  if (letter !== -1) return [0, letter, s];
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return [1, n, s];
  return [2, 0, s];
}

export function compareSizes(a: string | null | undefined, b: string | null | undefined): number {
  const [ga, va, sa] = sizeRank(a);
  const [gb, vb, sb] = sizeRank(b);
  return ga - gb || va - vb || sa.localeCompare(sb);
}
