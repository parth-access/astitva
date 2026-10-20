"use client";

import { useId } from "react";

export type SwatchColour = { name: string | null; hex: string | null; available: number };

/**
 * A colour choice as round swatches. Real radio buttons underneath, so
 * arrow keys move between colours and screen readers hear the names.
 * Sold-out colours stay choosable (to see them) and are struck through.
 */
export function SwatchPicker({
  colours,
  value,
  onChange,
  onPreview,
  size = "md",
  legend = "Colour",
  showName = true,
}: {
  colours: SwatchColour[];
  value: string | null;
  onChange: (name: string | null) => void;
  /** Hover or focus without choosing (shop cards preview the colour). */
  onPreview?: (name: string | null | undefined) => void;
  size?: "sm" | "md" | "lg";
  legend?: string;
  showName?: boolean;
}) {
  const name = useId();
  const named = colours.filter((c) => c.name);
  if (named.length === 0) return null;
  const dot = size === "sm" ? "size-4" : size === "lg" ? "size-9" : "size-7";
  const gap = size === "sm" ? "gap-2.5" : "gap-3.5";
  const chosen = named.find((c) => c.name === value);

  return (
    <fieldset onMouseLeave={() => onPreview?.(undefined)}>
      <legend className={showName ? "text-sm" : "sr-only"}>
        <span className="font-medium">{legend}</span>
        {showName && chosen ? (
          <span className="text-espresso-soft">
            {" "}
            · {chosen.name}
            {chosen.available <= 0 ? ", sold out" : ""}
          </span>
        ) : null}
      </legend>
      <div className={`flex flex-wrap items-center ${gap} ${showName ? "mt-3" : ""}`} role="presentation">
        {named.map((c) => (
          <label
            key={c.name}
            className="swatch-option"
            title={`${c.name}${c.available <= 0 ? " (sold out)" : ""}`}
            onMouseEnter={() => onPreview?.(c.name)}
          >
            <input
              type="radio"
              name={name}
              value={c.name ?? ""}
              checked={value === c.name}
              onChange={() => onChange(c.name)}
              onFocus={() => onPreview?.(c.name)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`swatch relative block ${dot} rounded-full ${c.available <= 0 ? "swatch-out" : ""}`}
              style={{ backgroundColor: c.hex ?? "#d9c7ad" }}
            />
            <span className="sr-only">
              {c.name}
              {c.available <= 0 ? ", sold out" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
