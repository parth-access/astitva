"use client";

import Image, { type ImageProps } from "next/image";
import { cloudinaryUrl } from "@/lib/cloudinary-url";

/**
 * next/image for photos on Cloudinary: Cloudinary resizes and picks the
 * format, so our server (and the host's image allowance) is not involved.
 * A client component because the loader is a function.
 */
export function CloudImage({ alt, ...props }: ImageProps & { src: string }) {
  return <Image {...props} alt={alt} loader={({ src, width, quality }) => cloudinaryUrl(src, { width, quality })} />;
}
