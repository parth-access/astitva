/* eslint-disable @typescript-eslint/no-explicit-any -- reading JSON-LD shapes in tests */
import { describe, expect, it } from "vitest";
import { whatsappNumber } from "../../src/lib/india";
import { parseSettingsForm } from "../../src/modules/catalog-admin/settings";
import { breadcrumbLd, faqLd, itemListLd, ldJson, organizationLd, pageMeta, productLd, websiteLd, type LdPiece } from "../../src/lib/seo";

const neem: LdPiece = {
  slug: "neem-linen-wrap-dress",
  name: "Linen wrap dress",
  pieceName: "Neem",
  pieceNumber: 1,
  description: "A wrap dress in soft-washed linen.",
  material: "Linen blend",
  category: "dresses",
  images: [
    { url: "https://res.cloudinary.com/x/image/upload/v1/sage.jpg", color: "Sage" },
    { url: "https://res.cloudinary.com/x/image/upload/v1/all.jpg", color: null },
  ],
  variants: [
    { sku: "AST-01-SAGE-S", size: "S", color: "Sage", priceMinor: 349_900, condition: "new_with_tags", available: 2 },
    { sku: "AST-01-INK-M", size: "M", color: "Ink", priceMinor: 349_950, condition: "new_with_tags", available: 0 },
  ],
};

describe("structured data", () => {
  it("describes a style as a group of colour and size variants, each with its price and stock", () => {
    const ld = productLd(neem) as Record<string, any>;
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.name).toBe("Nº 01 Neem, linen wrap dress");
    expect(ld.variesBy).toEqual(["https://schema.org/color", "https://schema.org/size"]);
    const [sage, ink] = ld.hasVariant;
    expect(sage.offers).toMatchObject({ price: "3499.00", priceCurrency: "INR", availability: "https://schema.org/InStock" });
    expect(sage.offers.url).toMatch(/\/pieces\/neem-linen-wrap-dress\?colour=Sage$/);
    expect(sage.image).toEqual(["https://res.cloudinary.com/x/image/upload/v1/sage.jpg", "https://res.cloudinary.com/x/image/upload/v1/all.jpg"]);
    expect(ink.offers).toMatchObject({ price: "3499.50", availability: "https://schema.org/OutOfStock" });
    expect(ink.image).toEqual(["https://res.cloudinary.com/x/image/upload/v1/all.jpg"]);
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Astitva" });
    expect(sage.description).toBe(neem.description);
  });

  it("uses a plain Product for a single variant, and the share card when there's no photo", () => {
    const ld = productLd({ ...neem, images: [], variants: [neem.variants[0]!] }) as Record<string, any>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.image[0]).toMatch(/\/pieces\/neem-linen-wrap-dress\/share\.png$/);
    expect(ld.offers.itemCondition).toBe("https://schema.org/NewCondition");
  });

  it("states delivery and returns on each offer, free delivery only where the piece reaches it", () => {
    const terms = { shippingFlatMinor: 9_900, freeShippingFromMinor: 349_950, handlingDays: [2, 4], transitDays: [3, 7], returnDays: 7, freeReturns: null } as const;
    const [sage, ink] = (productLd({ ...neem, terms }) as any).hasVariant;
    expect(sage.offers.shippingDetails.shippingRate).toEqual({ "@type": "MonetaryAmount", value: "99.00", currency: "INR" });
    expect(ink.offers.shippingDetails.shippingRate.value).toBe("0.00");
    expect(sage.offers.shippingDetails.deliveryTime.handlingTime).toMatchObject({ minValue: 2, maxValue: 4, unitCode: "DAY" });
    expect(sage.offers.hasMerchantReturnPolicy).toMatchObject({ applicableCountry: "IN", merchantReturnDays: 7 });
    // Return fees only once the returns policy is final.
    expect("returnFees" in sage.offers.hasMerchantReturnPolicy).toBe(false);
    const final = (productLd({ ...neem, terms: { ...terms, freeReturns: true } }) as any).hasVariant[0];
    expect(final.offers.hasMerchantReturnPolicy.returnFees).toBe("https://schema.org/FreeReturn");
    expect("shippingDetails" in (productLd(neem) as any).hasVariant[0].offers).toBe(false);
  });

  it("numbers the breadcrumb trail", () => {
    const ld = breadcrumbLd([
      { name: "Astitva", path: "/" },
      { name: "Shop", path: "/shop" },
    ]) as Record<string, any>;
    expect(ld.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2]);
  });

  it("can't be broken out of its script tag", () => {
    const json = ldJson({ description: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).description).toBe("</script><script>alert(1)</script>");
  });
});

describe("brand, FAQ and category data", () => {
  it("names the brand's own profiles, and leaves sameAs out without any", () => {
    const ld = organizationLd({ whatsapp: null, email: null, profiles: ["https://www.instagram.com/astitva"] }) as any;
    expect(ld.sameAs).toEqual(["https://www.instagram.com/astitva"]);
    expect("sameAs" in organizationLd({ whatsapp: null, email: null })).toBe(false);
  });

  it("names the site Astitva, with its address as an alternate name", () => {
    const site = websiteLd() as any;
    expect(site.name).toBe("Astitva");
    expect(site.alternateName).toContain(new URL(site.url).host.replace(/^www\./, ""));
    expect((organizationLd({ whatsapp: null, email: null }) as any)["@type"]).toBe("OnlineStore");
  });

  it("keeps the site's card unless a page has its own, and then the site name and locale too", () => {
    const meta = pageMeta({ title: "About", description: "The story.", path: "/about" });
    expect(meta.title).toBe("About");
    expect(meta.alternates?.canonical).toBe("/about");
    expect("openGraph" in meta).toBe(false);
    const piece = pageMeta({ title: "Neem", description: "A dress.", path: "/pieces/neem", images: [{ url: "/pieces/neem/share.png" }] });
    expect(piece.openGraph).toMatchObject({ siteName: "Astitva", locale: "en_IN", title: "Neem | Astitva", url: "/pieces/neem" });
    expect(pageMeta({ absoluteTitle: "Astitva — Home", description: "", path: "/" }).title).toEqual({ absolute: "Astitva — Home" });
  });

  it("describes a FAQ page question by question", () => {
    const ld = faqLd([{ question: "How can I pay?", answer: "By UPI, card or cash on delivery." }]) as any;
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "How can I pay?", acceptedAnswer: { "@type": "Answer", text: "By UPI, card or cash on delivery." } });
  });

  it("lists a category's pieces in order, at absolute addresses", () => {
    const ld = itemListLd("Dresses", ["/pieces/neem", "/pieces/saanjh"]) as any;
    expect(ld.itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[0].url).toMatch(/^https?:\/\/[^/]+\/pieces\/neem$/);
  });

  it("takes profile links one per line, https only, without repeats", () => {
    const form = (links: string) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ note: "", supportWhatsapp: "", shippingFlatMinor: "0", codFeeMinor: "0", codMaxOrderMinor: "5000", profileLinks: links })) f.append(k, v);
      return f;
    };
    const ok = parseSettingsForm(form("https://www.instagram.com/astitva\n\nhttps://in.pinterest.com/astitva\nhttps://www.instagram.com/astitva"));
    expect(ok.ok && ok.data.profileLinks).toEqual(["https://www.instagram.com/astitva", "https://in.pinterest.com/astitva"]);
    const bad = parseSettingsForm(form("http://instagram.com/astitva"));
    expect(!bad.ok && bad.errors.profileLinks).toMatch(/https/);
    const none = parseSettingsForm(form(""));
    expect(none.ok && none.data.profileLinks).toEqual([]);
  });

  it("adds India's country code to a WhatsApp number given as a 10-digit mobile", () => {
    expect(whatsappNumber("9315524561")).toBe("919315524561");
    expect(whatsappNumber("919315524561")).toBe("919315524561");
    expect(whatsappNumber("447700900123")).toBe("447700900123");
    expect(whatsappNumber(null)).toBeNull();
    const f = new FormData();
    for (const [k, v] of Object.entries({ note: "", supportWhatsapp: "93155 24561", shippingFlatMinor: "0", codFeeMinor: "0", codMaxOrderMinor: "5000", profileLinks: "" })) f.append(k, v);
    const parsed = parseSettingsForm(f);
    expect(parsed.ok && parsed.data.supportWhatsapp).toBe("919315524561");
  });
});
