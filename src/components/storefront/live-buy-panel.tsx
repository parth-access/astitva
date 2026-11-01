"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BuyPanel, type BuyVariant } from "./buy-panel";

/**
 * The buy panel with stock read when the page opens, so the rest of the piece's
 * page can be served from the CDN. The server checks stock again on adding and paying.
 */
export function LiveBuyPanel({
  productId,
  variants,
  orderingOpen,
  sizeGuide,
  fallback,
}: {
  productId: string;
  variants: Omit<BuyVariant, "available">[];
  orderingOpen: boolean;
  sizeGuide: ReactNode;
  fallback: ReactNode;
}) {
  const [stock, setStock] = useState<{ productId: string; available: Record<string, number> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/stock?piece=${encodeURIComponent(productId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Stock: ${res.status}`);
        setStock({ productId, available: (await res.json()) as Record<string, number> });
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [productId, tries]);

  if (stock?.productId !== productId) {
    if (!failed) return fallback;
    return (
      <p role="alert" className="mt-8 text-sm text-espresso-soft">
        We couldn&apos;t check what&apos;s in stock.{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setFailed(false);
            setTries((n) => n + 1);
          }}
        >
          Try again
        </button>
      </p>
    );
  }
  return <BuyPanel orderingOpen={orderingOpen} sizeGuide={sizeGuide} variants={variants.map((v) => ({ ...v, available: stock.available[v.id] ?? 0 }))} />;
}
