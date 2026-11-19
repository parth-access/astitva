/**
 * The product feed Google Merchant Center reads on a schedule (RSS 2.0 with
 * Google's g: fields): one item per colour and size, from what the shop
 * actually offers, so listings can't drift from the site's prices and stock.
 * Pure: the route (app/feeds/google-products.xml) passes it the catalogue.
 *
 * Only what a piece's page already shows goes in. A piece with no photo is
 * left out: Google needs a real photo, and the share card has text on it.
 */
import { paiseToDecimal, type Paise } from "@/lib/money";
import { BRAND, TAGLINE, absolute, productGroupId } from "@/lib/seo";

/** Google's "Apparel & Accessories > Clothing". */
const GOOGLE_CATEGORY_CLOTHING = 1604;
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_EXTRA_IMAGES = 10;

export type FeedPiece = {
  slug: string;
  pieceNumber: number | null;
  name: string;
  pieceName: string | null;
  description: string;
  story: string | null;
  seoDescription: string | null;
  material: string | null;
  category: string | null;
  images: { url: string; color: string | null }[];
  variants: {
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    priceMinor: Paise;
    compareAtMinor: Paise | null;
    condition: string | null;
  }[];
};

export type FeedSettings = {
  /** What can be bought right now, by variant id. */
  available: Map<string, number>;
  shippingFlatMinor: Paise;
  freeShippingThresholdMinor: Paise | null;
};

/** Text for XML: escaped, with the control characters XML can't hold removed. */
function xml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex -- removing exactly these
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** "THE MUSE TOP" → "The Muse Top": Google flags titles in capitals. Mixed case is left alone. */
function unshouted(text: string): string {
  return text === text.toUpperCase() ? text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()) : text;
}

function money(paise: Paise): string {
  return `${paiseToDecimal(paise)} INR`;
}

function field(name: string, value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "" : `      <g:${name}>${xml(String(value))}</g:${name}>\n`;
}

/** The colour's own photos, then the ones for every colour; any photo if it has neither. */
function photosFor(piece: FeedPiece, color: string | null): string[] {
  const own = piece.images.filter((i) => i.color === color).map((i) => i.url);
  const shared = piece.images.filter((i) => i.color === null).map((i) => i.url);
  const list = [...new Set(color === null ? shared : [...own, ...shared])];
  return list.length ? list : [...new Set(piece.images.map((i) => i.url))];
}

function item(piece: FeedPiece, v: FeedPiece["variants"][number], settings: FeedSettings): string {
  const photos = photosFor(piece, v.color);
  const named = piece.pieceName ? `${unshouted(piece.pieceName)} ${piece.name.toLowerCase()}` : unshouted(piece.name);
  const size = v.size ?? "One size";
  const title = [named, v.color, size].filter(Boolean).join(" - ").slice(0, MAX_TITLE);
  const description = (piece.description.trim() || piece.seoDescription?.trim() || piece.story?.trim() || named).slice(0, MAX_DESCRIPTION);
  const path = `/pieces/${piece.slug}`;
  const onSale = v.compareAtMinor !== null && v.compareAtMinor > v.priceMinor;
  // This piece alone, as the product data on its page says: free when it reaches the free-delivery amount by itself.
  const free = settings.freeShippingThresholdMinor !== null && v.priceMinor >= settings.freeShippingThresholdMinor;
  return [
    "    <item>\n",
    field("id", v.sku),
    field("item_group_id", productGroupId(piece)),
    `      <title>${xml(title)}</title>\n`,
    `      <description>${xml(description)}</description>\n`,
    `      <link>${xml(absolute(v.color ? `${path}?colour=${encodeURIComponent(v.color)}` : path))}</link>\n`,
    field("image_link", photos[0]),
    ...photos.slice(1, MAX_EXTRA_IMAGES + 1).map((url) => field("additional_image_link", url)),
    field("availability", (settings.available.get(v.id) ?? 0) > 0 ? "in_stock" : "out_of_stock"),
    field("price", money(onSale ? v.compareAtMinor! : v.priceMinor)),
    onSale ? field("sale_price", money(v.priceMinor)) : "",
    field("brand", BRAND),
    field("condition", v.condition === "like_new" || v.condition === "gently_used" ? "used" : "new"),
    // The shop's own label: no barcodes.
    field("identifier_exists", "no"),
    field("google_product_category", GOOGLE_CATEGORY_CLOTHING),
    field("product_type", piece.category),
    field("color", v.color),
    field("size", size),
    field("gender", "female"),
    field("age_group", "adult"),
    field("material", piece.material),
    "      <g:shipping>\n",
    "        <g:country>IN</g:country>\n",
    `        <g:price>${money(free ? 0 : settings.shippingFlatMinor)}</g:price>\n`,
    "      </g:shipping>\n",
    "    </item>\n",
  ].join("");
}

/** The whole feed. While ordering is closed the route passes no pieces: nothing can be bought. */
export function productFeed(pieces: FeedPiece[], settings: FeedSettings): string {
  const items = pieces
    .filter((p) => p.images.length > 0)
    .flatMap((p) => p.variants.map((v) => item(p, v, settings)))
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>${xml(BRAND)}</title>\n` +
    `    <link>${xml(absolute("/"))}</link>\n` +
    `    <description>${xml(`${BRAND}: ${TAGLINE}`)}</description>\n` +
    items +
    `  </channel>\n` +
    `</rss>\n`
  );
}
