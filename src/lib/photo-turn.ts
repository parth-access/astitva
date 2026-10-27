/**
 * Turning a piece round from still photos: Krishna marks which photos show
 * its front, side and back (and, if she has one, its other side), and the
 * piece page lets the buyer drag between them. Without a photo of the other
 * side, the side photo is shown mirrored. Safe for the browser.
 */

export const PHOTO_ANGLES = ["front", "side", "back", "other_side"] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
  other_side: "Other side",
};

/** One step of the turn: a photo, maybe mirrored, at a quarter turn. */
export type TurnFrame = { url: string; alt: string; mirrored: boolean; angle: PhotoAngle };

/**
 * The four quarter turns (front, side, back, other side) from a colour's
 * photos, in the order they come round. Null unless the front, a side and the
 * back are all there: a turn with a gap would jump.
 */
export function turnFrames(photos: readonly { url: string; alt: string; angle: PhotoAngle | null }[]): TurnFrame[] | null {
  const find = (angle: PhotoAngle) => photos.find((p) => p.angle === angle);
  const front = find("front");
  const side = find("side");
  const back = find("back");
  if (!front || !side || !back) return null;
  const other = find("other_side");
  return [
    { url: front.url, alt: front.alt, mirrored: false, angle: "front" },
    { url: side.url, alt: side.alt, mirrored: false, angle: "side" },
    { url: back.url, alt: back.alt, mirrored: false, angle: "back" },
    other ? { url: other.url, alt: other.alt, mirrored: false, angle: "other_side" } : { url: side.url, alt: side.alt, mirrored: true, angle: "other_side" },
  ];
}
