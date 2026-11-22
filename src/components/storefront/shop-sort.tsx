"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { GridRows } from "./grid-rows";
import { PRODUCT_SORTS, shopHref, sortCards, sortFrom, type ProductSort, type SortKeys } from "@/lib/shop-sort";

/**
 * The shop's order lives in the address (?sort=price_asc) but is applied
 * here, in the browser. The page itself is the same for every order, so it
 * is built once and served from the cache instead of rendered per visit.
 * (Reading it with useSearchParams would make React wait for the browser
 * before showing the grid at all.)
 */
const CHANGED = "astitva:shop-sort";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const current = () => sortFrom(new URLSearchParams(window.location.search).get("sort"));

/** The built page is in Krishna's order; the browser switches once it knows the address. */
function useShopSort(): ProductSort {
  return useSyncExternalStore(subscribe, current, () => "sequence");
}

export function SortLinks({ category }: { category?: string }) {
  const sort = useShopSort();
  const choose = (s: ProductSort) => (e: MouseEvent<HTMLAnchorElement>) => {
    // A new tab or window still opens the address as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    window.history.pushState(null, "", shopHref(category, s));
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <nav aria-label="Sort" className="flex items-center gap-3 text-sm">
      <span className="text-espresso-soft">Sort</span>
      <ul className="flex gap-4">
        {(Object.keys(PRODUCT_SORTS) as ProductSort[]).map((s) => (
          <li key={s}>
            <a
              href={shopHref(category, s)}
              onClick={choose(s)}
              aria-current={s === sort ? "true" : undefined}
              className={s === sort ? "text-burgundy underline underline-offset-4" : "link no-underline hover:underline"}
            >
              {PRODUCT_SORTS[s]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type SortableCard = { id: string; keys: SortKeys; card: ReactNode };

/** The grid's cards, in the order the address asks for. The breaks stay where they are. */
export function SortedGrid({ cards, breaks }: { cards: SortableCard[]; breaks: ReactNode[] }) {
  const sort = useShopSort();
  return <GridRows cards={sortCards(cards, sort)} breaks={breaks} />;
}
