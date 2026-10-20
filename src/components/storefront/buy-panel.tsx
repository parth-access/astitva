"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatINR } from "@/lib/money";
import { useBag } from "./bag/bag-context";
import { useSelection } from "./piece-selection";
import { SwatchPicker } from "./swatch-picker";

export type BuyVariant = {
  id: string;
  size: string | null;
  color: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  available: number;
};

/**
 * Colour, size, live availability and the buy button. Rendered with fresh
 * stock on every request. Only the colours and sizes that exist are offered;
 * sold-out ones stay visible, marked. Adding sends a dot of the colour to the
 * bag in the masthead, then opens the bag.
 */
export function BuyPanel({
  variants,
  orderingOpen,
  sizeGuide,
}: {
  variants: BuyVariant[];
  orderingOpen: boolean;
  /** The measurements table, opened in a side panel. */
  sizeGuide?: ReactNode;
}) {
  const { colours, colour, setColour, size, setSize, adoptAddressColour } = useSelection();
  // Now that this panel has hydrated, the colour named in the address can take over.
  useEffect(() => adoptAddressColour(), [adoptAddressColour]);
  const bag = useBag();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<{ variantId: string; message: string } | null>(null);
  const forColour = variants.filter((v) => v.color === colour);
  const sizes = forColour.map((v) => v.size);
  const hasSizes = sizes.some((s) => s !== null) || sizes.length > 1;
  // Keep the chosen size when it exists in the new colour; otherwise the first in stock.
  const selected =
    forColour.find((v) => v.size === size) ??
    forColour.find((v) => v.available > 0) ??
    forColour[0] ??
    variants[0];

  const colourStock = colours.map((c) => ({
    ...c,
    available: variants.filter((v) => v.color === c.name).reduce((n, v) => n + Math.max(0, v.available), 0),
  }));
  const allOut = variants.every((v) => v.available <= 0);
  const out = !selected || selected.available <= 0;
  const inBag = selected ? (bag.bag.lines.find((l) => l.variantId === selected.id)?.quantity ?? 0) : 0;
  // Everything left in this colour and size is already in the bag.
  const allInBag = !!selected && selected.available > 0 && inBag >= selected.available;
  const disabled = !orderingOpen || out || adding || allInBag;
  const buttonText = allOut
    ? "Sold out"
    : out
      ? `Sold out${hasSizes && selected?.size ? ` in ${selected.size}` : ""}`
      : !orderingOpen
        ? "Ordering opens soon"
        : adding
          ? "Adding…"
          : allInBag
            ? "In your bag"
            : "Add to bag";

  async function addSelected(button: HTMLElement) {
    if (!selected || disabled) return;
    setAdding(true);
    setAddError(null);
    try {
      const error = await bag.add(selected.id, { el: button, colour: colours.find((c) => c.name === colour)?.hex ?? null });
      if (error) setAddError({ variantId: selected.id, message: error });
    } finally {
      setAdding(false);
    }
  }

  // The phone bar appears once the main button has scrolled away.
  const mainButton = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = mainButton.current;
    if (!el) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      setShowBar(el.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const guide = useRef<HTMLDialogElement>(null);

  if (!selected) return null;

  const note = allOut
    ? "Sold out for now. Ask about the next batch."
    : out
      ? `Sold out${colour ? ` in ${colour}` : ""}${hasSizes && selected.size ? `, ${selected.size}` : ""}. Try another ${hasSizes ? "size or colour" : "colour"}.`
      : selected.available <= 2
        ? `Only ${selected.available} left${hasSizes && selected.size ? ` in ${selected.size}` : ""}.`
        : "In stock, ready to send.";

  return (
    <div>
      {colours.some((c) => c.name) ? (
        <div className="mt-8">
          <SwatchPicker colours={colourStock} value={colour} onChange={setColour} size="lg" />
        </div>
      ) : null}

      {hasSizes ? (
        <fieldset className="mt-7">
          <div className="flex items-baseline justify-between gap-4">
            <legend className="text-sm font-medium">Size</legend>
            {sizeGuide ? (
              <button type="button" className="link-draw text-sm" onClick={() => guide.current?.showModal()}>
                Size guide
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {forColour.map((v) => (
              <label key={v.id} className="size-chip" data-out={v.available <= 0}>
                <input
                  type="radio"
                  name="size"
                  value={v.size ?? ""}
                  checked={v.id === selected.id}
                  onChange={() => setSize(v.size)}
                  className="sr-only"
                />
                {v.size ?? "One size"}
                {v.available <= 0 ? <span className="sr-only"> (sold out)</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <p className={`mt-6 text-sm ${out ? "text-espresso-soft" : "text-olive"}`} aria-live="polite">
        {note}
      </p>

      <div ref={mainButton} className="mt-4">
        <button type="button" className="btn-primary w-full" disabled={disabled} onClick={(e) => addSelected(e.currentTarget)}>
          {buttonText}
        </button>
        {addError && addError.variantId === selected.id ? (
          <p role="alert" className="mt-3 text-sm text-burgundy">
            {addError.message}
          </p>
        ) : allInBag ? (
          <p className="mt-3 text-sm text-espresso-soft">
            You have all {selected.available} in your bag.{" "}
            <button type="button" className="link" onClick={bag.open}>
              Open the bag
            </button>
          </p>
        ) : null}
        {!orderingOpen && !allOut ? <p className="mt-3 text-sm text-espresso-soft">We&apos;re opening soon. Ask Krishna if you&apos;d like this one kept for you.</p> : null}
      </div>

      {/* Phones: once the button scrolls away, a bar keeps the choice and the button in reach. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-taupe/50 bg-ivory/95 px-4 py-3 backdrop-blur transition-transform duration-300 md:hidden ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!showBar}
      >
        <div className="flex items-center gap-4">
          <p className="flex flex-1 items-center gap-2.5 tabular-nums">
            {colour ? (
              <span className="swatch relative inline-block size-5 shrink-0 rounded-full" style={{ backgroundColor: colours.find((c) => c.name === colour)?.hex ?? "#d9c7ad" }} />
            ) : null}
            <span>
              <span className="block text-xs text-espresso-soft">{[colour, hasSizes ? selected.size : null].filter(Boolean).join(" · ")}</span>
              {formatINR(selected.priceMinor)}
            </span>
          </p>
          <button type="button" className="btn-primary flex-1" disabled={disabled} tabIndex={showBar ? 0 : -1} onClick={(e) => addSelected(e.currentTarget)}>
            {buttonText}
          </button>
        </div>
      </div>

      {sizeGuide ? (
        <dialog
          ref={guide}
          className="sheet"
          aria-label="Size guide"
          onClick={(e) => {
            // A click on the backdrop (the dialog itself, not its content) closes it.
            if (e.target === e.currentTarget) guide.current?.close();
          }}
        >
          <div className="h-full overflow-y-auto p-6 sm:p-10">
            <div className="flex items-center justify-between">
              <p className="caption text-xl">Size guide</p>
              <button type="button" className="link text-sm" onClick={() => guide.current?.close()}>
                Close
              </button>
            </div>
            <div className="mt-6">{sizeGuide}</div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
