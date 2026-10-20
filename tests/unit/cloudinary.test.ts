import { describe, expect, it } from "vitest";
import { cloudinaryUrl, isCloudinaryUrl } from "@/lib/cloudinary-url";
import { CHAPTER_FOLDER, cloudinarySignature, PIECE_FOLDER, publicIdFromUrl, signUpload, verifyUpload } from "@/modules/media/cloudinary";

const account = { cloudName: "demo", apiKey: "123", apiSecret: "shh" };
const photo = "https://res.cloudinary.com/demo/image/upload/v1712/astitva/pieces/abc123.jpg";

function receipt(overrides: Record<string, unknown> = {}) {
  const public_id = "astitva/pieces/abc123";
  const version = 1712;
  return {
    public_id,
    version,
    signature: cloudinarySignature({ public_id, version }, account.apiSecret),
    secure_url: photo,
    width: 1600,
    height: 2000,
    colors: [["#6B6B46", 41.2]] as [string, number][],
    ...overrides,
  };
}

describe("cloudinary", () => {
  it("signs sorted parameters followed by the secret (Cloudinary's documented example)", () => {
    // From Cloudinary's "Generating authentication signatures" docs.
    expect(cloudinarySignature({ timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" }, "abcd")).toBe(
      "bfd09f95f331f558cbd1320e67aa8d488770583e",
    );
  });

  it("signs uploads into the pieces folder only", () => {
    const { url, fields } = signUpload(PIECE_FOLDER, account, 1_700_000_000_000);
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(fields).toMatchObject({ folder: "astitva/pieces", api_key: "123", timestamp: "1700000000" });
    const signed: Record<string, string> = { ...fields };
    delete signed.signature;
    delete signed.api_key;
    expect(fields.signature).toBe(cloudinarySignature(signed, account.apiSecret));
  });

  it("accepts a genuine reply and takes the tone from its main colour", () => {
    expect(verifyUpload(receipt(), PIECE_FOLDER, account)).toEqual({
      publicId: "astitva/pieces/abc123",
      url: photo,
      width: 1600,
      height: 2000,
      tone: "#6b6b46",
    });
  });

  it("rejects forged, foreign or out-of-folder replies", () => {
    expect(verifyUpload(receipt(), CHAPTER_FOLDER, account)).toBeNull();
    expect(verifyUpload(receipt({ signature: "0".repeat(40) }), PIECE_FOLDER, account)).toBeNull();
    expect(verifyUpload(receipt({ secure_url: "https://evil.example/x.jpg" }), PIECE_FOLDER, account)).toBeNull();
    expect(verifyUpload(receipt({ secure_url: photo.replace("/demo/", "/other/") }), PIECE_FOLDER, account)).toBeNull();
    const elsewhere = { public_id: "other/abc", version: 1712 };
    expect(
      verifyUpload(receipt({ ...elsewhere, signature: cloudinarySignature(elsewhere, account.apiSecret) }), PIECE_FOLDER, account),
    ).toBeNull();
  });

  it("builds resized delivery addresses and finds the id in a stored address", () => {
    expect(isCloudinaryUrl(photo)).toBe(true);
    expect(cloudinaryUrl(photo, { width: 640 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1712/astitva/pieces/abc123.jpg",
    );
    expect(cloudinaryUrl("/brand/mascot.webp", { width: 640 })).toBe("/brand/mascot.webp");
    expect(publicIdFromUrl(photo, account)).toBe("astitva/pieces/abc123");
  });
});
