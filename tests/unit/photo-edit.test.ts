import { describe, expect, it } from "vitest";
import { cloudinaryUrl, withTransformation } from "@/lib/cloudinary-url";
import { editedPhotoUrl, fullCrop, photoEditSchema, photoEditTransformation, turnedSize } from "@/lib/photo-edit";
import { publicIdFromUrl } from "@/modules/media/cloudinary";

const original = "https://res.cloudinary.com/demo/image/upload/v1712/astitva/pieces/abc123.jpg";
const account = { cloudName: "demo", apiKey: "123", apiSecret: "shh" };

describe("photo edits", () => {
  it("mirrors, then turns, then crops with relative values Cloudinary can't mistake for pixels", () => {
    expect(photoEditTransformation({ rotate: 270, flip: true, crop: { x: 0, y: 0.25, width: 1, height: 0.5 } })).toBe(
      "a_hflip/a_270/c_crop,x_0.0000,y_0.2500,w_1.0000,h_0.5000",
    );
    expect(photoEditTransformation({ rotate: 0, flip: false, crop: { x: 0.1, y: 0, width: 0.8, height: 1 } })).toBe("c_crop,x_0.1000,y_0.0000,w_0.8000,h_1.0000");
  });

  it("puts the edit before any sizing, so sizes apply to the edited photo", () => {
    const edited = editedPhotoUrl(original, { rotate: 90, flip: false, crop: { x: 0, y: 0, width: 1, height: 0.5 } });
    expect(edited).toBe("https://res.cloudinary.com/demo/image/upload/a_90/c_crop,x_0.0000,y_0.0000,w_1.0000,h_0.5000/v1712/astitva/pieces/abc123.jpg");
    expect(cloudinaryUrl(edited, { width: 640, height: 800 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/a_90/c_crop,x_0.0000,y_0.0000,w_1.0000,h_0.5000/f_auto,q_auto,c_fill,g_auto,w_640,h_800/v1712/astitva/pieces/abc123.jpg",
    );
    expect(withTransformation(edited, "f_jpg")).toContain(",h_0.5000/f_jpg/v1712/");
    expect(publicIdFromUrl(edited, account)).toBe("astitva/pieces/abc123");
    expect(editedPhotoUrl(original, null)).toBe(original);
  });

  it("finds the largest centred 4:5 crop, with quarter turns swapping the sides", () => {
    expect(turnedSize(3000, 2000, 90)).toEqual({ width: 2000, height: 3000 });
    // Landscape: full height, 4:5 of it wide.
    const wide = fullCrop(3000, 2000);
    expect(wide.height).toBe(1);
    expect(wide.width * 3000).toBeCloseTo(0.8 * 2000);
    expect(wide.x).toBeCloseTo((1 - wide.width) / 2);
    // Tall: full width, 5:4 of it high.
    const tall = fullCrop(1000, 2000);
    expect(tall.width).toBe(1);
    expect(tall.height * 2000).toBeCloseTo(1000 / 0.8);
  });

  it("refuses crops outside the photo and turns that aren't quarter turns", () => {
    const ok = { rotate: 0, flip: false, crop: { x: 0.2, y: 0, width: 0.8, height: 1 } };
    expect(photoEditSchema.safeParse(ok).success).toBe(true);
    expect(photoEditSchema.safeParse({ ...ok, crop: { ...ok.crop, x: 0.5 } }).success).toBe(false);
    expect(photoEditSchema.safeParse({ ...ok, rotate: 45 }).success).toBe(false);
    expect(photoEditSchema.safeParse({ ...ok, crop: { ...ok.crop, width: 0 } }).success).toBe(false);
  });
});
