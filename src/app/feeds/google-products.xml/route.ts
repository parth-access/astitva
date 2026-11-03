import { connection } from "next/server";
import { db } from "@/db/client";
import { getProductBySlug, getStorefront, listCategories, listPieces } from "@/modules/catalog/queries";
import { productFeed } from "@/modules/catalog/product-feed";
import { getCheckoutSettings } from "@/modules/checkout/queries";
import { getAvailability } from "@/modules/inventory/service";

/**
 * Every colour and size for Google Merchant Center, which fetches this on a
 * schedule. Stock is live, so it is built on each request. Public: it holds
 * only what the shop's pages already show.
 */
export async function GET() {
  await connection();
  const [store, settings] = await Promise.all([getStorefront(), getCheckoutSettings()]);
  const [cards, categories] = store.orderingOpen ? await Promise.all([listPieces({ limit: 500 }), listCategories()]) : [[], []];
  const details = await Promise.all(cards.map((c) => getProductBySlug(c.slug)));
  const pieces = details.flatMap((p) => (p && p.variants.length > 0 ? [{ ...p, category: categories.find((c) => c.slug === p.categorySlug)?.name ?? null }] : []));
  const available = await getAvailability(db, pieces.flatMap((p) => p.variants.map((v) => v.id)));
  const body = productFeed(pieces, { available, shippingFlatMinor: settings.shippingFlatMinor, freeShippingThresholdMinor: settings.freeShippingThresholdMinor });
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" } });
}
