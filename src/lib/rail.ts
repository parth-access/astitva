/**
 * The clothing rail on a piece page: each colour hangs on the rail as a
 * cut-out on its hanger. Swiping the rail changes the colour; tapping the
 * front garment opens it to look closer and turn it round. Safe for the browser.
 */

export const RAIL_SIDES = ["front", "back"] as const;
export type RailSide = (typeof RAIL_SIDES)[number];

export type RailPhoto = { color: string | null; side: RailSide; url: string; width: number | null; height: number | null };

export type RailGarment = { colour: string | null; front: RailPhoto; back: RailPhoto | null };

/**
 * The garments to hang, one per colour in the piece's order, or null when
 * the piece gets no rail. A rail with a colour missing would offer fewer
 * colours than the piece has, so every colour needs its front first; until
 * then the piece page shows its photos as before. The back is optional.
 */
export function railGarments(colours: { name: string | null }[], photos: RailPhoto[]): RailGarment[] | null {
  if (colours.length === 0) return null;
  const garments: RailGarment[] = [];
  for (const c of colours) {
    const front = photos.find((p) => p.color === c.name && p.side === "front");
    if (!front) return null;
    garments.push({ colour: c.name, front, back: photos.find((p) => p.color === c.name && p.side === "back") ?? null });
  }
  return garments;
}
