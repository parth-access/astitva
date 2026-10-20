"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Plate } from "@/components/brand/plate";
import { formatPieceNumber } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { lineProblem, MAX_PER_LINE, type BagLine } from "@/modules/bag/types";
import { untilFreeShipping } from "@/modules/checkout/pricing";
import { useBag } from "./bag-context";

/**
 * The bag, sliding in from the right (from the bottom on phones). Each line
 * shows the piece in the chosen colour, a quantity stepper capped at what's in
 * stock, and what's wrong if it can no longer be had.
 */
export function BagDrawer() {
  const { enabled, bag, isOpen, close, notice, pricing } = useBag();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);

  if (!enabled) return null;
  const toFree = untilFreeShipping(bag.subtotalMinor, pricing);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="bag-title"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex items-baseline justify-between border-b border-taupe/40 px-6 py-5 sm:px-8">
          <h2 id="bag-title" className="text-3xl italic">
            Your bag
            {bag.count ? <span className="ml-3 align-middle font-sans text-sm not-italic text-espresso-soft tabular-nums">{bag.count} {bag.count === 1 ? "piece" : "pieces"}</span> : null}
          </h2>
          <button type="button" className="link text-sm" onClick={close}>
            Close
          </button>
        </div>

        {bag.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
            <p className="caption text-2xl">Nothing in it yet.</p>
            <Link href="/#pieces" onClick={close} className="btn-outline mt-8">
              Open the lookbook
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6 sm:px-8">
              {bag.lines.map((line) => (
                <BagRow key={line.id} line={line} />
              ))}
            </ul>

            <div className="border-t border-taupe/40 bg-ivory px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-8">
              {notice ? (
                <p role="status" className="mb-3 text-sm text-burgundy">
                  {notice}
                </p>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Subtotal</span>
                <span className="font-display text-2xl tabular-nums">{formatINR(bag.subtotalMinor)}</span>
              </div>
              <p className="mt-1 text-xs text-espresso-soft">
                {toFree ? `${formatINR(toFree)} more and shipping is free. ` : pricing.shippingFlatMinor === 0 ? "Shipping is free. " : ""}
                Inclusive of all taxes.
              </p>
              {bag.hasProblems ? (
                <>
                  <span className="btn-primary mt-5 w-full" aria-disabled="true">
                    Checkout
                  </span>
                  <p className="mt-2 text-xs text-espresso-soft">Change or remove the marked pieces to continue.</p>
                </>
              ) : (
                <Link href="/checkout" onClick={close} className="btn-primary mt-5 w-full">
                  Checkout
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function problemText(line: BagLine): string | null {
  const p = lineProblem(line);
  if (p === "withdrawn") return "No longer offered.";
  if (p === "sold_out") return "Sold out since you added it.";
  if (p === "fewer_left") return `Only ${line.available} left.`;
  return null;
}

function BagRow({ line }: { line: BagLine }) {
  const { setQuantity, remove, busyLine, close } = useBag();
  const busy = busyLine === line.id;
  const problem = problemText(line);
  const title = line.pieceName ?? line.name;
  const max = Math.min(MAX_PER_LINE, Math.max(line.available, line.quantity));
  const href = `/pieces/${line.slug}${line.colour ? `?colour=${encodeURIComponent(line.colour)}` : ""}`;

  return (
    <li className={`bag-row flex gap-5 border-b border-taupe/30 py-5 transition-opacity last:border-0 ${busy ? "opacity-50" : ""}`}>
      <Link href={href} onClick={close} className="w-20 shrink-0 sm:w-24" tabIndex={-1} aria-hidden="true">
        <Plate
          src={line.imageUrl}
          alt={line.imageAlt}
          tone={line.colourHex ?? line.tone}
          pieceNumber={line.pieceNumber}
          category={line.categorySlug}
          sizes="96px"
          muted={problem !== null && lineProblem(line) !== "fewer_left"}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={href} onClick={close} className="min-w-0">
            {line.pieceNumber ? <span className="block text-xs tabular-nums text-espresso-soft">{formatPieceNumber(line.pieceNumber)}</span> : null}
            <span className="block truncate font-display text-xl italic leading-tight hover:text-burgundy">{title}</span>
          </Link>
          <span className="shrink-0 text-sm tabular-nums">{formatINR(line.priceMinor * line.quantity)}</span>
        </div>
        <p className="mt-1 flex items-center gap-2 text-sm text-espresso-soft">
          {line.colourHex ? <span className="swatch relative inline-block size-3.5 rounded-full" style={{ backgroundColor: line.colourHex }} /> : null}
          {[line.colour, line.size].filter(Boolean).join(" · ") || line.name}
        </p>
        {problem ? <p className="mt-1 text-sm text-burgundy">{problem}</p> : null}

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="stepper" role="group" aria-label={`Quantity of ${title}`}>
            <button type="button" aria-label="One fewer" disabled={busy} onClick={() => setQuantity(line.id, line.quantity - 1)}>
              −
            </button>
            <span aria-live="polite" className="tabular-nums">
              {line.quantity}
            </span>
            <button type="button" aria-label="One more" disabled={busy || line.quantity >= max || !line.onSale} onClick={() => setQuantity(line.id, line.quantity + 1)}>
              +
            </button>
          </div>
          <button type="button" className="link-draw text-sm text-espresso-soft" disabled={busy} onClick={() => remove(line.id)}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
