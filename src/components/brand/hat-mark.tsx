import { HAT_ORNAMENT } from "./mascot-data";

/**
 * The mascot's hat as a fine-line ornament: its silhouette and band, traced from the logo.
 * Gold by default via `text-gold`; never used as text.
 */
export function HatMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="2 4 452 300"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {HAT_ORNAMENT.map((d) => (
        <path key={d} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
