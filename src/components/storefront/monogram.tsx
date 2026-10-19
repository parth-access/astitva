/**
 * Placeholder for the "A" monogram until the final vector logo arrives.
 * Swap this component's contents for the supplied SVG; keep the props.
 */
export function Monogram({ className, title = "Astitva" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={className} role="img" aria-label={title}>
      <path
        d="M10 148 V60 A50 50 0 0 1 110 60 V148"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="60"
        y="118"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontSize="84"
        fill="currentColor"
      >
        A
      </text>
    </svg>
  );
}
