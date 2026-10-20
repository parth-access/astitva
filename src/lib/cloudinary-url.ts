/**
 * Cloudinary delivery addresses. Our stored photo URLs are the untouched
 * originals; resizing and format happen by adding a transformation after
 * "/upload/". Safe for the browser: no credentials here.
 */

const UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/;

export function isCloudinaryUrl(src: string): boolean {
  return UPLOAD.test(src);
}

/**
 * The photo at `width` pixels wide, in the best format the browser takes
 * (AVIF/WebP), at automatic quality. Never upscales. Non-Cloudinary
 * addresses come back unchanged.
 */
export function cloudinaryUrl(src: string, opts: { width: number; quality?: number; height?: number }): string {
  const m = UPLOAD.exec(src);
  if (!m) return src;
  const t = [
    "f_auto",
    opts.quality ? `q_${Math.round(opts.quality)}` : "q_auto",
    opts.height ? "c_fill,g_auto" : "c_limit",
    `w_${Math.round(opts.width)}`,
    opts.height ? `h_${Math.round(opts.height)}` : null,
  ]
    .filter(Boolean)
    .join(",");
  return `${m[1]}${t}/${m[2]}`;
}
