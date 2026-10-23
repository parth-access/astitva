/**
 * Google Analytics 4: what may reach it. Pure helpers, safe on server and
 * client; the browser side is components/storefront/analytics.tsx.
 *
 * The measurement ID is set for production builds only (netlify.toml), so
 * local work and deploy previews never count as visits.
 */

/** Empty outside production: then nothing loads and no banner shows. */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

/** Query parameters worth keeping: the shop's own filters and campaign tags. Everything else (an order's private key, `next=`) is dropped. */
const KEEP = new Set(["colour", "category", "sort", "gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"]);

/**
 * A page's address as Analytics may see it: same-origin only, private query
 * parameters dropped, and each order page reported as one page.
 */
export function cleanUrl(href: string, origin: string): string {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return origin;
  }
  if (url.origin !== origin) return url.origin;
  const path = url.pathname.replace(/^\/orders\/[^/]+$/, "/orders/[number]");
  const kept = [...url.searchParams].filter(([k]) => KEEP.has(k));
  const qs = new URLSearchParams(kept).toString();
  return `${url.origin}${path}${qs ? `?${qs}` : ""}`;
}

/** The address a visitor came from: another site's origin only, or one of ours cleaned. */
export function cleanReferrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    return url.origin === origin ? cleanUrl(referrer, origin) : `${url.origin}/`;
  } catch {
    return "";
  }
}

/**
 * Paise as the rupee number Analytics reports in (349950 → 3499.5). For its
 * reports only: no amount we charge or store is ever computed from this.
 */
export function gaRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** One line of an e-commerce event, in Analytics' own field names. */
export type GaItem = {
  item_id: string;
  item_name: string;
  item_brand: "Astitva";
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

export function gaItem(p: {
  slug: string;
  name: string;
  category?: string | null;
  colour?: string | null;
  size?: string | null;
  priceMinor: number;
  quantity?: number;
}): GaItem {
  const variant = [p.colour, p.size].filter(Boolean).join(" / ");
  return {
    item_id: p.slug,
    item_name: p.name,
    item_brand: "Astitva",
    ...(p.category ? { item_category: p.category } : {}),
    ...(variant ? { item_variant: variant } : {}),
    price: gaRupees(p.priceMinor),
    quantity: p.quantity ?? 1,
  };
}
