/**
 * Search and sharing: the site's public address and the structured data
 * (schema.org JSON-LD) that tells search engines what a page is about: the
 * brand, the site, each style with its colours, sizes, prices and stock, and
 * where a page sits in the shop.
 *
 * Only facts the site already shows are described; nothing is claimed here
 * that isn't on the page.
 */
import type { Metadata } from "next";
import { formatPieceNumber } from "./format";

export const BRAND = "Astitva";
export const TAGLINE = "Your true form";

/** The site's public origin, without a trailing slash. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** "astitva.store". */
function host(): string {
  return new URL(siteUrl()).host.replace(/^www\./, "");
}

export function absolute(path: string): string {
  return path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A page's title, description, canonical address and share card.
 * `title` is the page's own; the layout's template adds the brand.
 * `absoluteTitle` is the whole title, brand included.
 *
 * Without `images` the page sets no openGraph: Next then fills the share
 * title and description from the page's and keeps the site's card
 * (app/opengraph-image). A page's own openGraph replaces the layout's whole,
 * card included (metadata merges shallowly), so with `images` it is built
 * here with the site name and locale.
 */
export function pageMeta(opts: {
  title?: string;
  absoluteTitle?: string;
  description: string;
  path: string;
  images?: NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;
}): Metadata {
  return {
    title: opts.absoluteTitle ? { absolute: opts.absoluteTitle } : opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    ...(opts.images
      ? { openGraph: { ...OPEN_GRAPH, title: opts.absoluteTitle ?? `${opts.title} | ${BRAND}`, description: opts.description, url: opts.path, images: opts.images } }
      : {}),
  };
}

/** What every page's share card says about the site. */
export const OPEN_GRAPH = { siteName: BRAND, type: "website", locale: "en_IN" } as const;

/** Paise to the decimal string schema.org expects ("3499.00"). */
function price(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

type Ld = Record<string, unknown>;

export function organizationLd(opts: { whatsapp: string | null; email: string | null; profiles?: string[] }): Ld {
  const contactPoint = [
    ...(opts.whatsapp ? [{ "@type": "ContactPoint", contactType: "customer service", telephone: `+${opts.whatsapp}`, areaServed: "IN", availableLanguage: ["en", "hi"] }] : []),
    ...(opts.email ? [{ "@type": "ContactPoint", contactType: "customer service", email: opts.email, areaServed: "IN" }] : []),
  ];
  return {
    "@context": "https://schema.org",
    // The most specific kind of organization a shop that sells online is.
    "@type": "OnlineStore",
    "@id": `${siteUrl()}/#organization`,
    name: BRAND,
    alternateName: [`${BRAND}: ${TAGLINE}`, host()],
    slogan: TAGLINE,
    description: "Womenswear by Astitva: a few considered styles, each in several colours, sold online and delivered across India.",
    url: siteUrl(),
    logo: absolute("/icon.png"),
    ...(contactPoint.length ? { contactPoint } : {}),
    // The brand's own profiles elsewhere, so search engines connect them to it.
    ...(opts.profiles?.length ? { sameAs: opts.profiles } : {}),
  };
}

export function websiteLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    // The name search shows for the site: "Astitva", with the address as a fallback.
    name: BRAND,
    alternateName: [`${BRAND}: ${TAGLINE}`, host()],
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

/** The pieces a page lists, in order: a category page's grid. */
export function itemListLd(name: string, paths: string[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: paths.map((path, i) => ({ "@type": "ListItem", position: i + 1, url: absolute(path) })),
  };
}

export type LdPiece = {
  slug: string;
  name: string;
  pieceName: string | null;
  pieceNumber: number | null;
  description: string;
  material: string | null;
  countryOfOrigin: string;
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
  /** Delivery and returns as the page states them, for merchant listings. */
  terms?: {
    shippingFlatMinor: number;
    freeShippingFromMinor: number | null;
    handlingDays: readonly [number, number];
    transitDays: readonly [number, number];
    returnDays: number;
    /** Only once the returns policy is final: until then its fees aren't a promise. */
    freeReturns: boolean | null;
  };
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
  const days = ([min, max]: readonly [number, number]) => ({ "@type": "QuantitativeValue", minValue: min, maxValue: max, unitCode: "DAY" });
  const t = p.terms;
  const offer = (v: LdPiece["variants"][number]) => ({
    "@type": "Offer",
    url: v.color ? `${url}?colour=${encodeURIComponent(v.color)}` : url,
    price: price(v.priceMinor),
    priceCurrency: "INR",
    availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: CONDITION[v.condition ?? "new"] ?? "https://schema.org/NewCondition",
    seller: { "@id": `${siteUrl()}/#organization` },
    ...(t
      ? {
          shippingDetails: {
            "@type": "OfferShippingDetails",
            // This piece alone: free when it reaches the free-delivery amount by itself.
            shippingRate: {
              "@type": "MonetaryAmount",
              value: price(t.freeShippingFromMinor !== null && v.priceMinor >= t.freeShippingFromMinor ? 0 : t.shippingFlatMinor),
              currency: "INR",
            },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
            deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: days(t.handlingDays), transitTime: days(t.transitDays) },
          },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "IN",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: t.returnDays,
            returnMethod: "https://schema.org/ReturnByMail",
            ...(t.freeReturns === null ? {} : { returnFees: t.freeReturns ? "https://schema.org/FreeReturn" : "https://schema.org/ReturnShippingFees" }),
          },
        }
      : {}),
  });
  const base = {
    brand: { "@type": "Brand", name: BRAND },
    ...(p.material ? { material: p.material } : {}),
    countryOfOrigin: { "@type": "Country", name: p.countryOfOrigin },
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
      // Merchant listings read each variant on its own, so it carries the description too.
      description: p.description,
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

/** The questions and answers a FAQ page shows, word for word. */
export function faqLd(items: { question: string; answer: string }[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}
