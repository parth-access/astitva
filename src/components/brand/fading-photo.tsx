"use client";

import Image, { getImageProps } from "next/image";
import { useState } from "react";
import { preload } from "react-dom";
import { cloudinaryUrl, isCloudinaryUrl } from "@/lib/cloudinary-url";

const loader = ({ src, width, quality }: { src: string; width: number; quality?: number }) => cloudinaryUrl(src, { width, quality });

type Layer = { src: string; alt: string; shown: boolean };

/**
 * A photo on Cloudinary that changes without a gap. When `src` changes (a
 * new colour), the photo on screen stays until the new one has loaded, then
 * the new one fades in over it and the old one goes. Switching again before
 * it has loaded skips the one in between. Without this, the arch shows its
 * bare colour while the next photo downloads.
 */
export function FadingPhoto({ src, alt, sizes, priority, className = "" }: { src: string; alt: string; sizes: string; priority?: boolean; className?: string }) {
  // The first photo is shown at once: it is in the page's HTML and the browser paints it as it arrives.
  const [layers, setLayers] = useState<Layer[]>([{ src, alt, shown: true }]);
  const top = layers[layers.length - 1]!;
  if (top.src !== src) {
    // A new photo: keep the last one fully shown underneath it, drop any still loading.
    const under = layers.filter((l) => l.shown).slice(-1);
    setLayers([...under, { src, alt, shown: false }]);
  } else if (top.alt !== alt) {
    setLayers(layers.map((l) => (l === top ? { ...l, alt } : l)));
  }

  const show = (shownSrc: string) => setLayers((ls) => ls.map((l) => (l.src === shownSrc ? { ...l, shown: true } : l)));
  // Once the top photo has faded in, the ones beneath it are hidden anyway.
  const settle = (settledSrc: string) => setLayers((ls) => (ls[ls.length - 1]?.src === settledSrc && ls.length > 1 ? ls.slice(-1) : ls));

  return (
    <>
      {layers.map((l, i) => {
        const isTop = i === layers.length - 1;
        return (
          <Image
            key={l.src}
            src={l.src}
            alt={isTop ? l.alt : ""}
            aria-hidden={isTop ? undefined : true}
            loader={loader}
            fill
            sizes={sizes}
            priority={priority && i === 0}
            className={`${className} transition-opacity duration-500 ease-out ${l.shown ? "opacity-100" : "opacity-0"}`}
            onLoad={() => show(l.src)}
            // A photo that fails to load still replaces the old one: better the arch's colour than the wrong colour's photo.
            onError={() => show(l.src)}
            onTransitionEnd={(e) => {
              if (e.propertyName === "opacity" && isTop && l.shown) settle(l.src);
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Starts downloading a photo at the size an image with these `sizes` will
 * ask for, so showing it later is instant. Low priority: it never competes
 * with what is on screen. Safe to call many times.
 */
export function preloadPhoto(src: string | null | undefined, sizes: string) {
  if (!src || !isCloudinaryUrl(src)) return;
  const { props } = getImageProps({ src, alt: "", fill: true, sizes, loader });
  preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: sizes, fetchPriority: "low" });
}
