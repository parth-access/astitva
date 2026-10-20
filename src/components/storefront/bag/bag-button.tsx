"use client";

import { useBag } from "./bag-context";

/** "Bag 2" in the masthead. The fly-to-bag dot lands on it; the count bounces. */
export function BagButton() {
  const { enabled, bag, open, bump } = useBag();
  if (!enabled) return null;
  const label = bag.count === 0 ? "Bag, empty" : `Bag, ${bag.count} ${bag.count === 1 ? "piece" : "pieces"}`;
  return (
    <button type="button" onClick={open} data-bag-target className="link-draw flex min-h-11 items-center gap-2 text-sm" aria-label={label} aria-haspopup="dialog">
      <span>Bag</span>
      <span
        key={bump}
        className={`bag-count inline-grid size-6 place-items-center rounded-full text-xs tabular-nums transition-colors ${
          bag.count ? "bg-espresso text-ivory" : "border border-taupe text-espresso-soft"
        }`}
        data-bump={bump > 0}
      >
        {bag.count}
      </span>
    </button>
  );
}
