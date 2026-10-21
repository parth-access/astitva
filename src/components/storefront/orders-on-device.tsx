"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { FORWARD } from "@/lib/transition-types";

/**
 * Orders remembered in this browser: each time a buyer opens their
 * private order page, its address is kept in this browser (localStorage),
 * so "Find your order" can open it again with one tap. Nothing is sent to
 * us; it holds only what that page's address already gave this browser.
 * Anyone who can open the browser could see it, so each can be forgotten.
 */

export type RememberedOrder = {
  number: string;
  /** The private page, `/orders/AST-001001?k=…`. */
  href: string;
  placedAt: string;
  /** "Neem", or "Neem and 1 more". */
  summary: string;
  total: string;
};

const KEY = "astitva:orders";
const CHANGED = "astitva:orders-changed";
const MAX = 12;

function read(): RememberedOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (o): o is RememberedOrder =>
        o && typeof o.number === "string" && typeof o.href === "string" && o.href.startsWith("/orders/") && typeof o.summary === "string" && typeof o.total === "string" && typeof o.placedAt === "string",
    );
  } catch {
    return [];
  }
}

function write(list: RememberedOrder[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Private mode or storage full: the page works without it.
  }
}

/** Kept until the browser's data is cleared, newest first, one entry per order. */
function remember(order: RememberedOrder) {
  write([order, ...read().filter((o) => o.number !== order.number)]);
}

function forget(number?: string) {
  write(number ? read().filter((o) => o.number !== number) : []);
}

// useSyncExternalStore needs the same value back until something changes, so cache by the raw text.
let cache: { raw: string | null; list: RememberedOrder[] } = { raw: null, list: [] };
function snapshot(): RememberedOrder[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cache.raw) cache = { raw, list: read() };
  return cache.list;
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
const nothing: RememberedOrder[] = [];

/** Put on the buyer's order page: remembers it in this browser. Renders nothing. */
export function RememberOrder({ order }: { order: RememberedOrder }) {
  const { number, href, placedAt, summary, total } = order;
  useEffect(() => {
    remember({ number, href, placedAt, summary, total });
  }, [number, href, placedAt, summary, total]);
  return null;
}

const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "Find your order": the orders opened on this device, each one tap away. Nothing until there's one. */
export function OrdersOnDevice() {
  const orders = useSyncExternalStore(subscribe, snapshot, () => nothing);
  if (orders.length === 0) return null;
  return (
    <section aria-labelledby="on-device" className="fade-in mb-14">
      <h2 id="on-device" className="caption text-xl">
        Your recent {orders.length === 1 ? "order" : "orders"}
      </h2>
      <p className="mt-1 text-sm text-espresso-soft">Opened before in this browser. Tap to see where it is now.</p>
      <ul className="mt-5 space-y-3">
        {orders.map((o) => (
          <li key={o.number} className="group relative">
            <Link
              href={o.href}
              transitionTypes={FORWARD}
              className="flex items-center gap-4 rounded-2xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] py-4 pl-5 pr-14 transition-colors hover:border-espresso"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs tracking-[0.18em] text-espresso-soft tabular-nums">{o.number}</span>
                <span className="mt-0.5 block truncate font-display text-xl italic">{o.summary}</span>
                <span className="mt-0.5 block text-sm text-espresso-soft">
                  {day.format(new Date(o.placedAt))} · <span className="tabular-nums">{o.total}</span>
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-espresso-soft transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <button
              type="button"
              onClick={() => forget(o.number)}
              aria-label={`Forget ${o.number} in this browser`}
              title="Forget in this browser"
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-espresso-soft opacity-60 hover:bg-champagne hover:opacity-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-espresso-soft">
        Kept only in this browser, never sent to us.{" "}
        <button type="button" className="link" onClick={() => forget()}>
          Forget {orders.length === 1 ? "it" : "them all"}
        </button>
      </p>
    </section>
  );
}
