import { createHash } from "node:crypto";

/**
 * Photos live on Cloudinary. The browser uploads straight to Cloudinary with
 * a signature from our server (so only signed-in admins can upload), and
 * Cloudinary's signed reply is checked before a photo is recorded (so nobody
 * can attach an image from elsewhere). Credentials come from CLOUDINARY_URL:
 * cloudinary://<api_key>:<api_secret>@<cloud_name>.
 */

type Account = { cloudName: string; apiKey: string; apiSecret: string };

/**
 * Cloudinary's request signature: the parameters sorted by name as
 * `a=1&b=2`, followed by the API secret, hashed with SHA-1. Our values never
 * contain "&" or "=", so no escaping is needed.
 */
export function cloudinarySignature(params: Record<string, string | number>, apiSecret: string): string {
  const text = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(text + apiSecret).digest("hex");
}

export function cloudinaryAccount(url = process.env.CLOUDINARY_URL): Account {
  if (!url) throw new Error("CLOUDINARY_URL is not set: photo uploads are unavailable.");
  const u = new URL(url);
  if (u.protocol !== "cloudinary:" || !u.username || !u.password || !u.hostname) {
    throw new Error("CLOUDINARY_URL should look like cloudinary://<api_key>:<api_secret>@<cloud_name>.");
  }
  return { cloudName: u.hostname, apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password) };
}

/** Where photos go, and what an upload may be. */
export const PIECE_FOLDER = "astitva/pieces";
export const CHAPTER_FOLDER = "astitva/chapters";
export type PhotoFolder = typeof PIECE_FOLDER | typeof CHAPTER_FOLDER;
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,avif,heic,heif";
/** Phone photos are often 4000+ px; nothing on the site needs more than this. Saves storage on the free plan. */
const INCOMING = "c_limit,w_2400,h_3000";

export type SignedUpload = { url: string; fields: Record<string, string> };

/** Everything the browser needs to post one file to Cloudinary. Valid for an hour (Cloudinary's rule). */
export function signUpload(folder: PhotoFolder, account = cloudinaryAccount(), now = Date.now()): SignedUpload {
  const params = {
    timestamp: String(Math.floor(now / 1000)),
    folder,
    allowed_formats: ALLOWED_FORMATS,
    transformation: INCOMING,
    colors: "true",
  };
  const signature = cloudinarySignature(params, account.apiSecret);
  return {
    url: `https://api.cloudinary.com/v1_1/${account.cloudName}/image/upload`,
    fields: { ...params, api_key: account.apiKey, signature },
  };
}

/** What the browser hands back after an upload: Cloudinary's reply, untrusted until checked. */
export type UploadReceipt = {
  public_id: string;
  version: number;
  signature: string;
  secure_url: string;
  width?: number;
  height?: number;
  colors?: [string, number][];
};

export type VerifiedPhoto = { publicId: string; url: string; width: number | null; height: number | null; tone: string | null };

/**
 * Checks Cloudinary's signature on the reply and that the file is ours, in
 * the expected folder. Returns null for anything else.
 */
export function verifyUpload(receipt: UploadReceipt, folder: PhotoFolder, account = cloudinaryAccount()): VerifiedPhoto | null {
  const { public_id, version, signature, secure_url } = receipt;
  if (typeof public_id !== "string" || !Number.isInteger(version) || typeof signature !== "string") return null;
  if (!public_id.startsWith(`${folder}/`)) return null;

  const expected = cloudinarySignature({ public_id, version }, account.apiSecret);
  if (expected !== signature) return null;

  const prefix = `https://res.cloudinary.com/${account.cloudName}/image/upload/v${version}/${public_id}.`;
  if (typeof secure_url !== "string" || !secure_url.startsWith(prefix) || !/^[a-z0-9]+$/i.test(secure_url.slice(prefix.length))) {
    return null;
  }

  const size = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 && (n as number) < 20_000 ? (n as number) : null);
  const top = receipt.colors?.[0]?.[0];
  return {
    publicId: public_id,
    url: secure_url,
    width: size(receipt.width),
    height: size(receipt.height),
    tone: typeof top === "string" && /^#[0-9a-f]{6}$/i.test(top) ? top.toLowerCase() : null,
  };
}

/** The Cloudinary id inside one of our photo addresses, or null for anything else. */
export function publicIdFromUrl(url: string, account = cloudinaryAccount()): string | null {
  const m = new RegExp(`^https://res\\.cloudinary\\.com/${account.cloudName}/image/upload/v\\d+/(.+)\\.[a-z0-9]+$`, "i").exec(url);
  return m?.[1] ?? null;
}

/** Deletes a photo from Cloudinary. Best effort: a leftover file costs a little storage, nothing more. */
export async function destroyPhoto(publicId: string, account = cloudinaryAccount()): Promise<void> {
  const params = { public_id: publicId, invalidate: "true", timestamp: String(Math.floor(Date.now() / 1000)) };
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${account.cloudName}/image/destroy`, {
      method: "POST",
      body: new URLSearchParams({ ...params, api_key: account.apiKey, signature: cloudinarySignature(params, account.apiSecret) }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`Cloudinary: could not delete ${publicId}`, err);
  }
}
