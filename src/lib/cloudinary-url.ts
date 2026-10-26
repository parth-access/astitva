/**
 * Cloudinary delivery addresses. A stored photo address is the original,
 * or the original with its edit (lib/photo-edit.ts) as a transformation
 * after "/upload/". Resizing and format are chained after that, so they
 * apply to the edited photo. Safe for the browser: no credentials here.
 */

// The address, any transformations already in it (an edit), and the version and file.
const UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)((?:[^/]+\/)*?)(v\d+\/.+)$/;

export function isCloudinaryUrl(src: string): boolean {
  return UPLOAD.test(src);
}

/**
 * The photo at `width` pixels wide, in the best format the browser takes
 * (AVIF/WebP), at automatic quality. Never upscales. Non-Cloudinary
 * addresses come back unchanged.
 */
export function cloudinaryUrl(src: string, opts: { width: number; quality?: number; height?: number }): string {
  const t = [
    "f_auto",
    opts.quality ? `q_${Math.round(opts.quality)}` : "q_auto",
    opts.height ? "c_fill,g_auto" : "c_limit",
    `w_${Math.round(opts.width)}`,
    opts.height ? `h_${Math.round(opts.height)}` : null,
  ]
    .filter(Boolean)
    .join(",");
  return withTransformation(src, t);
}

/** Adds a transformation after any already in the address (so after an edit). Non-Cloudinary addresses come back unchanged. */
export function withTransformation(src: string, transformation: string): string {
  const m = UPLOAD.exec(src);
  if (!m) return src;
  return `${m[1]}${m[2]}${transformation}/${m[3]}`;
}

const VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(v\d+\/.+)\.[a-z0-9]+$/i;

/** How many stills a turning video is cut into: one every 10°. */
export const SPIN_FRAMES = 36;

/**
 * Stills cut from a video of a piece turning round once, evenly through it,
 * cropped to the arch's 4:5 from the centre (the same crop for every frame,
 * so nothing jumps while it turns). Cloudinary makes each on first request.
 * Not a Cloudinary video address: an empty list.
 */
export function spinFrameUrls(video: string, opts: { width: number; frames?: number }): string[] {
  const m = VIDEO.exec(video);
  if (!m) return [];
  const frames = opts.frames ?? SPIN_FRAMES;
  const width = Math.round(opts.width);
  const height = Math.round((width * 5) / 4);
  return Array.from({ length: frames }, (_, i) => {
    // Percentages from the start; the last frame stops short of the end, which is the first again.
    const at = Math.round(((i * 100) / frames) * 10) / 10;
    return `${m[1]}so_${at}p,c_fill,g_center,w_${width},h_${height},f_auto,q_auto/${m[2]}.jpg`;
  });
}

export function isSpinVideoUrl(src: string): boolean {
  return VIDEO.test(src);
}
