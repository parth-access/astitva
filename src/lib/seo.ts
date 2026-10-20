/**
 * Search and sharing: the site's public address and the structured data
 * (schema.org JSON-LD) that tells search engines what a page is about: the
 * brand, the site, each style with its colours, sizes, prices and stock, and
 * where a page sits in the shop.
 *
 * Only facts the site already shows are described; nothing is claimed here
 * that isn't on the page.
 */
import { formatPieceNumber } from "./format";

export const BRAND = "Astitva";
export const TAGLINE = "Your true form";

/** The site's public origin, without a trailing slash. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function absolute(path: string): string {
  return path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Paise to the decimal string schema.org expects ("3499.00"). */
function price(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

type Ld = Record<string, unknown>;

export function organizationLd(opts: { whatsapp: string | null; email: string | null }): Ld {
  const contactPoint = [
    ...(opts.whatsapp ? [{ "@type": "ContactPoint", contactType: "customer service", telephone: `+${opts.whatsapp}`, areaServed: "IN", availableLanguage: ["en", "hi"] }] : []),
    ...(opts.email ? [{ "@type": "ContactPoint", contactType: "customer service", email: opts.email, areaServed: "IN" }] : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: BRAND,
    slogan: TAGLINE,
    url: siteUrl(),
    logo: absolute("/icon.png"),
    ...(contactPoint.length ? { contactPoint } : {}),
  };
}

export function websiteLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: BRAND,
    url: siteUrl(),
    inLanguage: "en-IN",
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absolute(t.path) })),
  };
}

export type LdPiece = {
  slug: string;
  name: string;
  pieceName: string | null;
  pieceNumber: number | null;
  description: string;
  material: string | null;
  category: string | null;
  images: { url: string; color: string | null }[];
  variants: {
    sku: string;
    size: string | null;
    color: string | null;
    priceMinor: number;
    condition: string | null;
    available: number;
  }[];
};

const CONDITION: Record<string, string> = {
  new_with_tags: "https://schema.org/NewCondition",
  new: "https://schema.org/NewCondition",
  like_new: "https://schema.org/UsedCondition",
  gently_used: "https://schema.org/UsedCondition",
};

/**
 * A style as a ProductGroup with one Product per colour and size, so search
 * can show the right price, colour and stock for each. With a single variant
 * it is a plain Product. Only published while ordering is open: before that
 * nothing can be bought, and offers would say otherwise.
 */
export function productLd(p: LdPiece): Ld {
  const title = [p.pieceNumber ? formatPieceNumber(p.pieceNumber) : null, p.pieceName ? `${p.pieceName}, ${p.name.toLowerCase()}` : p.name].filter(Boolean).join(" ");
  const url = absolute(`/pieces/${p.slug}`);
  const imageFor = (color: string | null) => {
    const own = p.images.filter((i) => i.color === color).map((i) => i.url);
    const shared = p.images.filter((i) => i.color === null).map((i) => i.url);
    const list = own.length ? [...own, ...shared] : shared.length ? shared : p.images.map((i) => i.url);
    return list.length ? list : [absolute(`/pieces/${p.slug}/share.png`)];
  };
  const offer = (v: LdPiece["variants"][number]) => ({
    "@type": "Offer",
    url: v.color ? `${url}?colour=${encodeURIComponent(v.color)}` : url,
    price: price(v.priceMinor),
    priceCurrency: "INR",
    availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: CONDITION[v.condition ?? "new"] ?? "https://schema.org/NewCondition",
    seller: { "@id": `${siteUrl()}/#organization` },
  });
  const base = {
    brand: { "@type": "Brand", name: BRAND },
    ...(p.material ? { material: p.material } : {}),
    ...(p.category ? { category: p.category } : {}),
  };

  if (p.variants.length === 1) {
    const v = p.variants[0]!;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: title,
      description: p.description,
      url,
      sku: v.sku,
      image: imageFor(v.color),
      ...(v.color ? { color: v.color } : {}),
      ...(v.size ? { size: v.size } : {}),
      ...base,
      offers: offer(v),
    };
  }

  const variesBy = [
    ...(new Set(p.variants.map((v) => v.color)).size > 1 ? ["https://schema.org/color"] : []),
    ...(new Set(p.variants.map((v) => v.size)).size > 1 ? ["https://schema.org/size"] : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${url}#style`,
    name: title,
    description: p.description,
    url,
    productGroupID: p.slug,
    variesBy,
    ...base,
    hasVariant: p.variants.map((v) => ({
      "@type": "Product",
      name: [title, v.color, v.size].filter(Boolean).join(" · "),
      sku: v.sku,
      image: imageFor(v.color),
      ...(v.color ? { color: v.color } : {}),
      ...(v.size ? { size: v.size } : {}),
      inProductGroupWithID: p.slug,
      offers: offer(v),
    })),
  };
}

/** For a <script type="application/ld+json">: "<" escaped so text can never close the tag. */
export function ldJson(data: Ld | Ld[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
