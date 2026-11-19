import { describe, expect, it } from "vitest";
import { productFeed, type FeedPiece } from "../../src/modules/catalog/product-feed";

const piece: FeedPiece = {
  slug: "the-muse-top",
  pieceNumber: 7,
  name: "Women's Square-Neck Top",
  pieceName: "THE MUSE TOP",
  description: "A top <soft> & easy.",
  story: null,
  seoDescription: null,
  material: "Cotton",
  category: "Tops",
  images: [
    { url: "https://res.cloudinary.com/x/image/upload/v1/black.jpg", color: "Black" },
    { url: "https://res.cloudinary.com/x/image/upload/v1/all.jpg", color: null },
  ],
  variants: [
    { id: "a", sku: "AST-05-BLACK-S", size: "S", color: "Black", priceMinor: 67_500, compareAtMinor: 99_900, condition: "new_with_tags" },
    { id: "b", sku: "AST-05-WHITE-M", size: null, color: "White", priceMinor: 120_000, compareAtMinor: null, condition: "like_new" },
  ],
};
const settings = { available: new Map([["a", 2], ["b", 0]]), shippingFlatMinor: 10_000, freeShippingThresholdMinor: 100_000 };
const items = (xml: string) => xml.split("<item>").slice(1);

describe("product feed", () => {
  it("lists every colour and size with what Google requires for clothing", () => {
    const [black] = items(productFeed([piece], settings));
    expect(black).toContain("<g:id>AST-05-BLACK-S</g:id>");
    expect(black).toContain("<g:item_group_id>the-muse-top</g:item_group_id>");
    expect(black).toContain("<title>The Muse Top women's square-neck top - Black - S</title>");
    expect(black).toMatch(/<link>https?:\/\/[^<]+\/pieces\/the-muse-top\?colour=Black<\/link>/);
    for (const f of ["<g:brand>Astitva</g:brand>", "<g:color>Black</g:color>", "<g:size>S</g:size>", "<g:gender>female</g:gender>", "<g:age_group>adult</g:age_group>", "<g:identifier_exists>no</g:identifier_exists>", "<g:product_type>Tops</g:product_type>", "<g:material>Cotton</g:material>", "<g:condition>new</g:condition>"]) {
      expect(black).toContain(f);
    }
  });

  it("gives a variant's own price, sale and live stock", () => {
    const [black, white] = items(productFeed([piece], settings));
    expect(black).toContain("<g:price>999.00 INR</g:price>\n      <g:sale_price>675.00 INR</g:sale_price>");
    expect(black).toContain("<g:availability>in_stock</g:availability>");
    expect(white).toContain("<g:price>1200.00 INR</g:price>\n");
    expect(white).not.toContain("sale_price");
    expect(white).toContain("<g:availability>out_of_stock</g:availability>");
    expect(white).toContain("<g:condition>used</g:condition>");
    expect(white).toContain("<g:size>One size</g:size>");
  });

  it("charges delivery unless the piece reaches the free-delivery amount by itself", () => {
    const [black, white] = items(productFeed([piece], settings));
    expect(black).toMatch(/<g:country>IN<\/g:country>\s*<g:price>100\.00 INR<\/g:price>/);
    expect(white).toMatch(/<g:country>IN<\/g:country>\s*<g:price>0\.00 INR<\/g:price>/);
    const free = items(productFeed([piece], { ...settings, shippingFlatMinor: 0, freeShippingThresholdMinor: null }))[0];
    expect(free).toMatch(/<g:country>IN<\/g:country>\s*<g:price>0\.00 INR<\/g:price>/);
  });

  it("shows the colour's photo first, then the ones for every colour", () => {
    const [black, white] = items(productFeed([piece], settings));
    expect(black).toContain("<g:image_link>https://res.cloudinary.com/x/image/upload/v1/black.jpg</g:image_link>");
    expect(black).toContain("<g:additional_image_link>https://res.cloudinary.com/x/image/upload/v1/all.jpg</g:additional_image_link>");
    expect(white).toContain("<g:image_link>https://res.cloudinary.com/x/image/upload/v1/all.jpg</g:image_link>");
    expect(white).not.toContain("black.jpg");
  });

  it("escapes text, falls back for an empty description, and leaves out a piece with no photo", () => {
    const xml = productFeed([piece], settings);
    expect(xml).toContain("<description>A top &lt;soft&gt; &amp; easy.</description>");
    expect(xml).not.toContain("<soft>");
    const bare = productFeed([{ ...piece, description: "  ", story: "Its story." }], settings);
    expect(bare).toContain("<description>Its story.</description>");
    expect(productFeed([{ ...piece, images: [] }], settings)).not.toContain("<item>");
  });

  it("is an empty channel with no pieces", () => {
    const xml = productFeed([], settings);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
