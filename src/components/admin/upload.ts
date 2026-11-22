import type { SignedUpload, UploadReceipt } from "@/modules/media/cloudinary";

/** Cloudinary's free plan accepts images up to 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
/** Cloudinary's free plan cuts stills from videos up to 40 MB: about 15 seconds of 1080p. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-m4v";

/**
 * Sends one file from the browser straight to Cloudinary using a signature
 * from our server, and returns Cloudinary's (signed) reply for the server to check.
 */
export async function uploadToCloudinary(original: File, sign: () => Promise<SignedUpload>, maxBytes = MAX_UPLOAD_BYTES): Promise<UploadReceipt> {
  const file = original.type.startsWith("image/") ? await shrinkPhoto(original) : original;
  if (file.size > maxBytes) throw new Error(`${file.name} is over ${maxBytes / 1024 / 1024} MB. Export a smaller copy and try again.`);
  const { url, fields } = await sign();
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  body.append("file", file);
  const res = await fetch(url, { method: "POST", body });
  const reply = await res.json();
  if (!res.ok) throw new Error(reply?.error?.message ?? `Upload failed (${res.status}).`);
  return reply as UploadReceipt;
}

/** The most the site keeps of a photo (Cloudinary's incoming limit, in cloudinary.ts). */
const KEEP_W = 2400;
const KEEP_H = 3000;

/**
 * A phone photo made no bigger than the site keeps, before it is sent: a
 * 4000 px, 5 MB photo becomes about 2400 px and under 1 MB, so most of the
 * wait (sending the file) goes. Cloudinary would shrink it anyway, after
 * receiving all of it. PNGs (perhaps transparent) and photos the browser
 * can't read (HEIC outside Safari) go as they are.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.type === "image/png" || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // turned upright from the photo's own orientation
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, KEEP_W / bitmap.width, KEEP_H / bitmap.height);
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/**
 * Runs `work` on every item, a few at a time, and returns each result or
 * error in the items' order. Uploads overlap; the quick server calls around
 * them still take turns (Next runs one tab's server actions one by one).
 */
export async function eachAtOnce<T, R>(items: T[], at: number, work: (item: T, i: number) => Promise<R>, onDone?: (finished: number) => void) {
  const out: ({ ok: true; value: R } | { ok: false; error: unknown })[] = new Array(items.length);
  let next = 0;
  let finished = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { ok: true, value: await work(items[i], i) };
      } catch (error) {
        out[i] = { ok: false, error };
      }
      onDone?.(++finished);
    }
  }
  await Promise.all(Array.from({ length: Math.min(at, items.length) }, lane));
  return out;
}
