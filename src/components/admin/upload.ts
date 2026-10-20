import type { SignedUpload, UploadReceipt } from "@/modules/media/cloudinary";

/** Cloudinary's free plan accepts images up to 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";

/**
 * Sends one file from the browser straight to Cloudinary using a signature
 * from our server, and returns Cloudinary's (signed) reply for the server to check.
 */
export async function uploadToCloudinary(file: File, sign: () => Promise<SignedUpload>): Promise<UploadReceipt> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 10 MB. Export a smaller copy and try again.`);
  const { url, fields } = await sign();
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  body.append("file", file);
  const res = await fetch(url, { method: "POST", body });
  const reply = await res.json();
  if (!res.ok) throw new Error(reply?.error?.message ?? `Upload failed (${res.status}).`);
  return reply as UploadReceipt;
}
