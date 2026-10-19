/**
 * A single-line wide-brimmed hat: an ornament drawn from the woman in the
 * Astitva identity board. Placeholder until the illustrator's files arrive;
 * swap the paths, keep the props.
 */
export function HatMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 120 46"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <ellipse cx="60" cy="34" rx="56" ry="7.5" vectorEffect="non-scaling-stroke" />
      <path d="M37 32.5 C 37 17, 45 9.5, 60 9.5 C 75 9.5, 83 17, 83 32.5" vectorEffect="non-scaling-stroke" />
      <path d="M37.4 27 C 50 30, 70 30, 82.6 27" vectorEffect="non-scaling-stroke" />
      <path d="M78 28.6 C 82 31, 86 33.5, 91 33" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
