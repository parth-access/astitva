"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addToBagAction, refreshBagAction, removeFromBagAction, setBagQuantityAction } from "@/app/(store)/bag/actions";
import { gaItem, gaRupees } from "@/lib/analytics";
import { EMPTY_BAG, type Bag } from "@/modules/bag/types";
import { track } from "../analytics";
import type { PricingSettings } from "@/modules/checkout/pricing";

/**
 * The bag, shared by the header button, the drawer and every "Add to bag"
 * button. The server is the source of truth: each change goes through a server
 * action, which answers with the whole bag as it now stands.
 */

type BagApi = {
  /** Ordering is open (store settings). When off, nothing about the bag shows. */
  enabled: boolean;
  pricing: PricingSettings;
  bag: Bag;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Adds one unit. `from` is the element the swatch flies from. Resolves with an error message, or null. */
  add: (variantId: string, from?: { el: Element; colour: string | null }) => Promise<string | null>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
  /** The line being changed, so it can show it. */
  busyLine: string | null;
  /** Message from the last change made in the drawer. */
  notice: string | null;
  /** Counts additions, so the header count can bounce once per add. */
  bump: number;
  /** The bag as the server has it (first load, refresh). */
  seed: (bag: Bag) => void;
};

const NOOP_PRICING: PricingSettings = { shippingFlatMinor: 0, freeShippingThresholdMinor: null };

const Ctx = createContext<BagApi>({
  enabled: false,
  pricing: NOOP_PRICING,
  bag: EMPTY_BAG,
  isOpen: false,
  open: () => {},
  close: () => {},
  add: async () => "Ordering opens soon.",
  setQuantity: async () => {},
  remove: async () => {},
  busyLine: null,
  notice: null,
  bump: 0,
  seed: () => {},
});

export function useBag(): BagApi {
  return use(Ctx);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The bag in the header that's on screen (phones and wide screens have their own), or null. */
function bagTarget() {
  return [...document.querySelectorAll<HTMLElement>("[data-bag-target]")].find((el) => el.offsetParent !== null) ?? null;
}

/**
 * The garment cut-out the buyer is looking at (marked data-bag-source: the
 * rail's front garment, or the face of the turned garment towards them),
 * if one is mostly on screen; the largest if there are several.
 */
function garmentOnScreen(): HTMLImageElement | null {
  let best: HTMLImageElement | null = null;
  let bestArea = 0;
  for (const img of document.querySelectorAll<HTMLImageElement>("img[data-bag-source]")) {
    if (!img.complete || !img.naturalWidth) continue;
    const r = img.getBoundingClientRect();
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (w > 0 && h > 0 && w * h > Math.max(bestArea, 0.5 * r.width * r.height)) {
      best = img;
      bestArea = w * h;
    }
  }
  return best;
}

/** A hidden tab pauses animations; the bag never waits on one longer than this. */
const FLIGHT_LIMIT_MS = 1000;
const landed = (anim: Animation, el: Element) =>
  Promise.race([anim.finished.catch(() => undefined), new Promise((r) => window.setTimeout(r, FLIGHT_LIMIT_MS))]).then(() => el.remove());

/**
 * Something arcs into the bag in the header: a copy of the garment the
 * buyer is looking at, when there is one, else a dot of the chosen colour
 * from the button. Resolves when it lands (at once with reduced motion or
 * no visible bag).
 */
function flyToBag(from: Element, colour: string | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const target = bagTarget();
  if (!target) return Promise.resolve();
  const garment = garmentOnScreen();
  return garment ? flyGarment(garment, target) : flyDot(from, target, colour);
}

/** The garment lifts a little, then arcs up into the bag, shrinking and tilting, and fades only as it drops in. */
function flyGarment(img: HTMLImageElement, target: HTMLElement): Promise<void> {
  const a = img.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const copy = document.createElement("img");
  copy.className = "bag-flyer-garment";
  copy.src = img.currentSrc || img.src;
  copy.alt = "";
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(copy);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const end = Math.min(0.2, 26 / a.height);
  const lift = Math.min(-60, dy * 0.25);
  const flight = copy.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { transform: "translate(0, -14px) scale(1.03) rotate(0deg)", offset: 0.12 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.3 + lift}px) scale(0.42) rotate(-7deg)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(-12deg)` },
    ],
    { duration: 820, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
  copy.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 820, fill: "forwards" });
  return landed(flight, copy);
}

/** A dot of the chosen colour arcs from the button to the bag. */
function flyDot(from: Element, target: HTMLElement, colour: string | null): Promise<void> {
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const dx = b.left + b.width / 2 - ax;
  const dy = b.top + b.height / 2 - ay;

  const dot = document.createElement("span");
  dot.className = "bag-flyer";
  dot.setAttribute("aria-hidden", "true");
  dot.style.left = `${ax - 9}px`;
  dot.style.top = `${ay - 9}px`;
  if (colour) dot.style.backgroundColor = colour;
  document.body.append(dot);

  const lift = Math.min(140, 60 + Math.abs(dy) * 0.25);
  const anim = dot.animate(
    [
      { transform: "translate(0, 0) scale(0.5)", opacity: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - lift}px) scale(1.1)`, opacity: 1, offset: 0.32 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - lift * 0.55}px) scale(0.85)`, opacity: 1, offset: 0.66 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.85 },
    ],
    { duration: 760, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
  return landed(anim, dot);
}

export function BagProvider({ enabled, pricing, children }: { enabled: boolean; pricing: PricingSettings; children: ReactNode }) {
  const [bag, setBag] = useState<Bag>(EMPTY_BAG);
  const [isOpen, setOpen] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const openTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const open = useCallback(() => {
    setNotice(null);
    setOpen(true);
    // Stock may have moved since the page loaded.
    void refreshBagAction().then(setBag);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const add = useCallback<BagApi["add"]>(async (variantId, from) => {
    const flight = from ? flyToBag(from.el, from.colour) : Promise.resolve();
    const [result] = await Promise.all([addToBagAction(variantId), flight]);
    setBag(result.bag);
    if (result.error) return result.error;
    const line = result.bag.lines.find((l) => l.variantId === variantId);
    if (line) {
      const item = gaItem({ slug: line.slug, name: line.pieceName ?? line.name, category: line.categorySlug, colour: line.colour, size: line.size, priceMinor: line.priceMinor });
      track("add_to_cart", { currency: "INR", value: gaRupees(line.priceMinor), items: [item] });
    }
    setBump((n) => n + 1);
    setNotice(null);
    // Let the count bounce, then show the bag.
    openTimer.current = window.setTimeout(() => setOpen(true), reducedMotion() ? 0 : 280);
    return null;
  }, []);

  const setQuantity = useCallback<BagApi["setQuantity"]>(async (lineId, quantity) => {
    setBusyLine(lineId);
    try {
      const result = await setBagQuantityAction(lineId, quantity);
      setBag(result.bag);
      setNotice(result.error ?? null);
    } finally {
      setBusyLine(null);
    }
  }, []);

  const remove = useCallback<BagApi["remove"]>(async (lineId) => {
    setBusyLine(lineId);
    try {
      const result = await removeFromBagAction(lineId);
      setBag(result.bag);
      setNotice(null);
    } finally {
      setBusyLine(null);
    }
  }, []);

  const value = useMemo<BagApi>(
    () => ({ enabled, pricing, bag, isOpen, open, close, add, setQuantity, remove, busyLine, notice, bump, seed: setBag }),
    [enabled, pricing, bag, isOpen, open, close, add, setQuantity, remove, busyLine, notice, bump],
  );
  return <Ctx value={value}>{children}</Ctx>;
}

/** Hands the server-rendered bag to the provider. */
