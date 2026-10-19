/**
 * Development seed: SAMPLE content only, so the storefront has something to
 * render. None of these are Krishna's real pieces, and the letter and stories
 * are placeholders written to show the format. Refuses to run in production.
 *
 *   npm run db:seed
 *
 * WARNING: wipes catalogue, orders and inventory tables first.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/create";
import {
  categories,
  chapters,
  orderItems,
  orders,
  productCategories,
  productVariants,
  products,
  suppliers,
  type Measurements,
} from "../src/db/schema";
import { adjustStock, reserveForOrder } from "../src/modules/inventory/service";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed sample data in production.");
  process.exit(1);
}

type SampleVariant = {
  size?: string;
  priceMinor: number;
  compareAtMinor?: number;
  onHand: number;
  measurements?: Measurements;
  condition?: "new_with_tags" | "new" | "like_new" | "gently_used";
};
type Sample = {
  pieceName: string;
  name: string;
  tone: string;
  category: string;
  featured?: boolean;
  material?: string;
  fit?: string;
  care?: string;
  story: string;
  stylingNote: string;
  variants: SampleVariant[];
  /** Sold through a real order during seeding, so the archive has something to show. */
  soldTo?: string;
};

const CATEGORIES = [
  { name: "Dresses", slug: "dresses", sortOrder: 1 },
  { name: "Co-ord sets", slug: "co-ords", sortOrder: 2 },
  { name: "Tops", slug: "tops", sortOrder: 3 },
  { name: "Outerwear", slug: "outerwear", sortOrder: 4 },
];

// Placeholder letter: Krishna writes the real one.
const LETTER = `For a long time I bought clothes the way most of us do: quickly, and for someone I thought I should be.

Astitva began when I started doing the opposite. Walking slowly through markets, touching fabric, waiting for the piece that felt like me rather than like everyone. Most days I came home with nothing. Some days I found something I could not stop thinking about.

These are those pieces. Each one was chosen by hand, and most of them exist only once. When one finds its home, it does not come back.

I hope one of them feels like you.`;

const SAMPLES: Sample[] = [
  {
    pieceName: "Neem",
    name: "Olive linen wrap dress",
    tone: "#6b6b46",
    category: "dresses",
    featured: true,
    material: "Linen blend",
    fit: "Relaxed, ties at the waist",
    care: "Hand wash cold, dry in shade",
    story: "Found folded at the back of a stall on a slow afternoon, the colour of neem leaves after rain. The linen has already softened, so it moves the moment you do.",
    stylingNote: "With flat kolhapuris and a single silver cuff. Leave the tie loose.",
    variants: [{ size: "M", priceMinor: 349_900, onHand: 1, condition: "new_with_tags", measurements: { bustCm: 96, waistCm: 78, lengthCm: 118 } }],
  },
  {
    pieceName: "Jamun",
    name: "Burgundy satin slip dress",
    tone: "#5b1a2a",
    category: "dresses",
    featured: true,
    material: "Satin",
    fit: "Bias cut, skims the body",
    care: "Dry clean",
    story: "A bias-cut slip in the deep purple-red of jamun stains on a summer afternoon. It catches the light differently every time you turn.",
    stylingNote: "Evenings, with an oversized blazer over the shoulders and nothing else competing.",
    variants: [{ size: "S", priceMinor: 289_900, compareAtMinor: 349_900, onHand: 1, condition: "new", measurements: { bustCm: 86, waistCm: 72, lengthCm: 112 } }],
  },
  {
    pieceName: "Chandni",
    name: "Ivory pleated co-ord set",
    tone: "#e9e1d0",
    category: "co-ords",
    featured: true,
    material: "Polyester crepe",
    fit: "Boxy shirt, straight trousers",
    care: "Machine wash gentle",
    story: "Two pieces in the soft white of moonlight on a terrace. The pleats hold their shape through a long day and still look deliberate at night.",
    stylingNote: "Wear the shirt open over a camisole, or tucked with a thin gold belt.",
    variants: [
      { size: "S", priceMinor: 459_900, onHand: 1, measurements: { bustCm: 100, waistCm: 70, lengthCm: 66 } },
      { size: "M", priceMinor: 459_900, onHand: 2, measurements: { bustCm: 106, waistCm: 76, lengthCm: 67 } },
      { size: "L", priceMinor: 459_900, onHand: 0, measurements: { bustCm: 112, waistCm: 82, lengthCm: 68 } },
    ],
  },
  {
    pieceName: "Mitti",
    name: "Sand cotton kurta top",
    tone: "#cdb592",
    category: "tops",
    material: "Cotton",
    fit: "Straight, side slits",
    care: "Machine wash cold",
    story: "Earth-coloured cotton with a band collar and the quiet weight of something made to be worn every day.",
    stylingNote: "Over wide denim, sleeves pushed up once.",
    variants: [{ size: "L", priceMinor: 179_900, onHand: 1, condition: "like_new", measurements: { bustCm: 108, lengthCm: 74 } }],
  },
  {
    pieceName: "Kahwa",
    name: "Espresso tailored blazer",
    tone: "#3d2a22",
    category: "outerwear",
    featured: true,
    material: "Wool blend",
    fit: "Single breasted, slightly cropped",
    care: "Dry clean",
    story: "The warm brown of Kashmiri kahwa, cut short with a soft shoulder. Structured enough for a meeting, easy enough for a café after.",
    stylingNote: "Over the Jamun slip, or with a white tee and straight trousers.",
    variants: [{ size: "M", priceMinor: 529_900, onHand: 1, condition: "gently_used", measurements: { bustCm: 98, shoulderCm: 39, sleeveCm: 58, lengthCm: 60 } }],
  },
  {
    pieceName: "Shabnam",
    name: "Champagne silk blouse",
    tone: "#e6d3b0",
    category: "tops",
    material: "Silk blend",
    fit: "Loose, dropped shoulder",
    care: "Hand wash cold",
    story: "A blouse the colour of morning dew on dry grass, loose enough to move in and fine enough to notice.",
    stylingNote: "Half tucked into high-waisted trousers.",
    variants: [{ size: "S", priceMinor: 249_900, onHand: 1, condition: "new", measurements: { bustCm: 104, lengthCm: 64 } }],
    soldTo: "Pune",
  },
  {
    pieceName: "Saanjh",
    name: "Taupe knit midi dress",
    tone: "#9c8b7c",
    category: "dresses",
    material: "Viscose knit",
    fit: "Fitted, stretch",
    care: "Hand wash cold, dry flat",
    story: "Ribbed knit in the grey-brown of dusk, with a square neck that sits just right on the collarbone.",
    stylingNote: "With a long coat and loafers when the evenings turn cool.",
    variants: [{ size: "M", priceMinor: 319_900, onHand: 1, condition: "new_with_tags", measurements: { bustCm: 84, waistCm: 66, lengthCm: 115 } }],
  },
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  const db = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    await db.execute(sql`
      truncate table inventory_movements, inventory_reservations, order_events, order_items, payment_events,
        refunds, payments, cod_collections, shipments, orders, cart_items, carts, product_images,
        product_categories, product_collections, product_variants, products, chapters, categories, collections, suppliers
      restart identity cascade`);

    const cats = await db.insert(categories).values(CATEGORIES).returning();
    const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const [market] = await db.insert(suppliers).values({ name: "Sample market supplier", notes: "Development data" }).returning();

    const [chapter] = await db
      .insert(chapters)
      .values({
        number: 1,
        slug: "aarambh",
        title: "Aarambh",
        subtitle: "The beginning. Pieces found one at a time, most of them only once.",
        letter: LETTER,
        letterSignature: "Krishna",
        tone: "#b9a68c",
        status: "published",
        releaseAt: new Date("2026-11-01T13:30:00Z"), // 7 pm IST, placeholder date
      })
      .returning();

    let n = 0;
    for (const s of SAMPLES) {
      n++;
      const slug = slugify(`${s.pieceName} ${s.name}`);
      const [p] = await db
        .insert(products)
        .values({
          name: s.name,
          slug,
          pieceNumber: n,
          pieceName: s.pieceName,
          story: s.story,
          stylingNote: s.stylingNote,
          tone: s.tone,
          chapterId: chapter!.id,
          description: "",
          status: "active",
          isFeatured: s.featured ?? false,
          material: s.material,
          fit: s.fit,
          careInstructions: s.care,
          publishedAt: new Date(Date.now() - n * 86_400_000),
        })
        .returning();
      await db.insert(productCategories).values({ productId: p!.id, categoryId: bySlug.get(s.category)! });

      for (const v of s.variants) {
        const [variant] = await db
          .insert(productVariants)
          .values({
            productId: p!.id,
            sku: `AST-${String(n).padStart(3, "0")}-${v.size ?? "OS"}`,
            size: v.size,
            priceMinor: v.priceMinor,
            compareAtMinor: v.compareAtMinor,
            measurements: v.measurements,
            condition: v.condition,
            supplierId: market!.id,
            acquisitionCostMinor: Math.round(v.priceMinor * 0.45),
            acquiredAt: new Date(),
          })
          .returning();
        if (v.onHand > 0) {
          await db.transaction((tx) =>
            adjustStock(tx, { variantId: variant!.id, delta: v.onHand, type: "receipt", reason: "Sample seed" }),
          );
        }
        if (s.soldTo) await sellSample(db, { variantId: variant!.id, productName: s.name, sku: `AST-${n}`, priceMinor: v.priceMinor, city: s.soldTo });
      }
    }
    console.log(`Seeded Chapter I with ${SAMPLES.length} sample pieces.`);
  } finally {
    await db.$client.end();
  }
}

/** A real COD order through the inventory engine, so "found their home" reflects an actual sale. */
async function sellSample(
  db: ReturnType<typeof createDb>,
  s: { variantId: string; productName: string; sku: string; priceMinor: number; city: string },
) {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        contactName: "Sample customer",
        contactPhone: "9000000000",
        orderStatus: "delivered",
        paymentMethod: "cod",
        subtotalMinor: s.priceMinor,
        totalMinor: s.priceMinor,
        shareCityInArchive: true,
        addressSnapshot: {
          recipientName: "Sample customer",
          phone: "9000000000",
          line1: "Sample address",
          city: s.city,
          state: "Maharashtra",
          pincode: "411001",
          countryCode: "IN",
        },
        idempotencyScope: "seed",
        idempotencyKey: randomUUID(),
      })
      .returning();
    await tx.insert(orderItems).values({
      orderId: order!.id,
      variantId: s.variantId,
      productNameSnapshot: s.productName,
      skuSnapshot: s.sku,
      variantSnapshot: {},
      quantity: 1,
      unitPriceMinor: s.priceMinor,
      lineTotalMinor: s.priceMinor,
    });
    await reserveForOrder(tx, { orderId: order!.id, lines: [{ variantId: s.variantId, quantity: 1 }], mode: "commit" });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
