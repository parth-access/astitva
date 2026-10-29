/**
 * The home page's Contents page shows three pieces, not every one (the shop
 * below shows them all). Krishna chooses them in the admin, in order; a
 * place she leaves empty, or whose piece is no longer published, is filled
 * at random from the rest. Framework-free so it can be tested.
 */

export const CONTENTS_PLACES = 3;

/**
 * `pieces`: every published piece, in house order. `picks`: the chosen ids, in
 * order. `random` returns a number in [0, 1), like Math.random.
 */
export function chooseContents<T extends { id: string }>(pieces: readonly T[], picks: readonly string[], random: () => number = Math.random): T[] {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const chosen: T[] = [];
  for (const id of picks) {
    const piece = byId.get(id);
    if (piece && !chosen.includes(piece)) chosen.push(piece);
    if (chosen.length === CONTENTS_PLACES) return chosen;
  }
  // Fill the rest by drawing at random from what's left.
  const rest = pieces.filter((p) => !chosen.includes(p));
  while (chosen.length < CONTENTS_PLACES && rest.length > 0) {
    const [drawn] = rest.splice(Math.floor(random() * rest.length), 1);
    chosen.push(drawn!);
  }
  return chosen;
}
