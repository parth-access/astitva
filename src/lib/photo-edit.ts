import { z } from "zod";

/**
 * A photo's edit: mirrored or not, turned in quarter turns, then cropped to
 * the arch's 4:5. Cloudinary applies it when the photo is delivered, so the
 * uploaded original is never changed and can be edited again from scratch.
 *
 * The crop is in fractions (0–1) of the photo after flipping and turning,
 * which Cloudinary accepts as relative values ("w_0.5000" is half the width).
 * Safe for the browser.
 */

export type PhotoEdit = {
  /** Clockwise, in degrees. */
  rotate: 0 | 90 | 180 | 270;
  /** Mirrored left to right, before turning. */
  flip: boolean;
  crop: { x: number; y: number; width: number; height: number };
};

/** Width / height of the arch every photo is shown in. */
export const PHOTO_RATIO = 4 / 5;

const fraction = z.number().min(0).max(1);
export const photoEditSchema = z
  .object({
    rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    flip: z.boolean(),
    crop: z.object({ x: fraction, y: fraction, width: fraction.min(0.02), height: fraction.min(0.02) }),
  })
  // Rounding in the browser can overshoot by a hair; anything more is outside the photo.
  .refine((e) => e.crop.x + e.crop.width <= 1.0005 && e.crop.y + e.crop.height <= 1.0005, "The crop runs outside the photo.");

/** Four decimals, always with a point: Cloudinary reads "1.0000" as 100%, but "1" as one pixel. */
const rel = (n: number) => Math.min(1, Math.max(0, n)).toFixed(4);

/** The Cloudinary transformation for an edit, e.g. "a_hflip/a_90/c_crop,x_0.1000,y_0.0000,w_0.8000,h_0.6667". */
export function photoEditTransformation(edit: PhotoEdit): string {
  const { x, y, width, height } = edit.crop;
  return [
    edit.flip ? "a_hflip" : null,
    edit.rotate ? `a_${edit.rotate}` : null,
    `c_crop,x_${rel(x)},y_${rel(y)},w_${rel(Math.min(width, 1 - x))},h_${rel(Math.min(height, 1 - y))}`,
  ]
    .filter(Boolean)
    .join("/");
}

/** The photo's original address with the edit applied; the original itself when there is no edit. */
export function editedPhotoUrl(original: string, edit: PhotoEdit | null): string {
  if (!edit) return original;
  return original.replace(/\/image\/upload\//, `/image/upload/${photoEditTransformation(edit)}/`);
}

/** Size of the photo after flipping and turning: a quarter turn swaps its sides. */
export function turnedSize(width: number, height: number, rotate: PhotoEdit["rotate"]) {
  return rotate % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** The largest 4:5 crop of a photo of this (turned) size, centred. */
export function fullCrop(width: number, height: number): PhotoEdit["crop"] {
  if (width / height > PHOTO_RATIO) {
    const w = (PHOTO_RATIO * height) / width;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = width / PHOTO_RATIO / height;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}
