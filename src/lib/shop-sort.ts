/**
 * The shop's sort orders. The shop pages are built once, in Krishna's order,
 * so they can be served from the cache; the browser puts them in another
 * order when one is chosen. Shared by the server and the browser.
 */

export type ProductSort = "sequence" | "newest" | "price_asc" | "price_desc";

export const PRODUCT_SORTS: Record<ProductSort, string> = {
  sequence: "In order",
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
};

export function sortFrom(value: string | string[] | null | undefined): ProductSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in PRODUCT_SORTS ? (raw as ProductSort) : "sequence";
}

/** A category has its own page (/shop/dresses); sorting is a view of it. */
export function shopHref(category: string | undefined, sort: ProductSort = "sequence") {
  return `/shop${category ? `/${encodeURIComponent(category)}` : ""}${sort !== "sequence" ? `?sort=${sort}` : ""}`;
}

/** What a card is sorted by. `at` is its place in Krishna's order. */
export type SortKeys = { at: number; priceMinor: number; publishedAt: number | null; name: string };

/** Cards in the chosen order. Ties keep Krishna's order. */
export function sortCards<T extends { keys: SortKeys }>(cards: T[], sort: ProductSort): T[] {
  if (sort === "sequence") return [...cards].sort((a, b) => a.keys.at - b.keys.at);
  const by = (a: SortKeys, b: SortKeys) => {
    if (sort === "price_asc") return a.priceMinor - b.priceMinor;
    if (sort === "price_desc") return b.priceMinor - a.priceMinor;
    // Newest first; a piece never published goes last.
    return (b.publishedAt ?? -Infinity) - (a.publishedAt ?? -Infinity);
  };
  return [...cards].sort((a, b) => by(a.keys, b.keys) || a.keys.at - b.keys.at);
}
