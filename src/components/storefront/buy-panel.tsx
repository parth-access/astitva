"use client";

import { useState } from "react";
import { formatINR } from "@/lib/money";

export type BuyVariant = {
  id: string;
  size: string | null;
  color: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  available: number;
};

function label(v: BuyVariant) {
  return [v.size, v.color].filter(Boolean).join(" / ") || "One size";
}

/**
 * Size choice, live availability and the buy button. Rendered with fresh stock
 * on every request. The bag itself arrives with the checkout milestone (M3);
 * until then the button stays disabled and says so.
 */
export function BuyPanel({ variants, orderingOpen }: { variants: BuyVariant[]; orderingOpen: boolean }) {
  const firstAvailable = variants.find((v) => v.available > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id);
  const selected = variants.find((v) => v.id === selectedId) ?? firstAvailable;
  if (!selected) return null;

  const single = variants.length === 1;
  const soldOut = variants.every((v) => v.available <= 0);
  const selectedOut = selected.available <= 0;
  const disabled = !orderingOpen || selectedOut;
  const buttonText = soldOut ? "Sold out" : selectedOut ? "Sold out in this size" : "Add to bag";

  return (
    <div>
      {!single && (
        <fieldset className="mt-8">
          <legend className="text-sm font-medium">Size</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {variants.map((v) => {
              const out = v.available <= 0;
              const checked = v.id === selected.id;
              return (
                <label
                  key={v.id}
                  className={`relative flex min-h-11 min-w-14 cursor-pointer items-center justify-center border px-4 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-burgundy ${
                    checked ? "border-espresso bg-espresso text-ivory" : "border-taupe hover:border-espresso"
                  } ${out ? "text-espresso-soft line-through decoration-1" : ""}`}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={checked}
                    onChange={() => setSelectedId(v.id)}
                    className="sr-only"
                  />
                  {label(v)}
                  {out && <span className="sr-only"> (sold)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className="mt-6 text-sm" aria-live="polite">
        {soldOut ? (
          <span className="text-espresso-soft">Sold out for now.</span>
        ) : selectedOut ? (
          <span className="text-espresso-soft">Sold in this size.</span>
        ) : selected.available <= 2 ? (
          <span className="text-olive">Available. Only {selected.available} left.</span>
        ) : (
          <span className="text-olive">Available</span>
        )}
      </p>

      <div className="mt-4 hidden md:block">
        <button type="button" className="btn-primary w-full" disabled={disabled}>
          {buttonText}
        </button>
        {!orderingOpen && !soldOut && (
          <p className="mt-3 text-sm text-espresso-soft">Online ordering opens soon.</p>
        )}
      </div>

      {/* Mobile: price and button stay in reach while the shopper scrolls the details. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-taupe/50 bg-ivory/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-4">
          <p className="flex-1 tabular-nums">
            <span className="block text-xs text-espresso-soft">{single ? "" : label(selected)}</span>
            {formatINR(selected.priceMinor)}
          </p>
          <button type="button" className="btn-primary flex-1" disabled={disabled}>
            {buttonText}
          </button>
        </div>
        {!orderingOpen && !soldOut && <p className="mt-1 text-center text-xs text-espresso-soft">Online ordering opens soon.</p>}
      </div>
    </div>
  );
}
