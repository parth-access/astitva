import Image from "next/image";
import { Monogram } from "./monogram";

type Props = {
  src: string | null;
  alt: string;
  /** Width / height. Product photography is shot 4:5. */
  ratio?: "4/5" | "3/4" | "2/3";
  sizes: string;
  priority?: boolean;
  className?: string;
};

/** Every product and campaign image sits in the arch. Without a photo, the arch shows the monogram. */
export function ArchImage({ src, alt, ratio = "4/5", sizes, priority, className = "" }: Props) {
  return (
    <div className={`arch relative w-full ${className}`} style={{ aspectRatio: ratio }}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-gold/70" aria-hidden={alt === "" || undefined}>
          <Monogram className="h-1/3 w-auto" title={alt || "Photograph coming soon"} />
        </div>
      )}
    </div>
  );
}
