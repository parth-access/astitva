/**
 * Development seed: SAMPLE content only, so the storefront has something to
 * render. Shaped like the launch: a few styles, each in several colours and
 * sizes. None of it is Krishna's real stock or words. Refuses to run in production.
 *
 *   npm run db:seed
 *
 * WARNING: wipes catalogue, orders and inventory tables first.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/create";
import { categories, productCategories, productVariants, products, storeSettings, suppliers, type Measurements } from "../src/db/schema";
import { adjustStock } from "../src/modules/inventory/service";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed sample data in production.");
  process.exit(1);
}

type Colour = { name: string; hex: string };
type Style = {
  pieceName: string;
  name: string;
  category: string;
  priceMinor: number;
  compareAtMinor?: number;
  material: string;
  fit: string;
  care: string;
  story: string;
  stylingNote: string;
  colours: Colour[];
  sizes: { size: string; measurements: Measurements }[];
  /** Units per colour and size; a missing entry means that combination isn't made. */
  stock: number[][];
};

const CATEGORIES = [
  { name: "Dresses", slug: "dresses", sortOrder: 1 },
  { name: "Co-ord sets", slug: "co-ords", sortOrder: 2 },
  { name: "Tops", slug: "tops", sortOrder: 3 },
  { name: "Outerwear", slug: "outerwear", sortOrder: 4 },
];

// Placeholder note: Krishna writes the real one.
const NOTE = `For a long time I bought clothes the way most of us do: quickly, and for someone I thought I should be.

Astitva began when I started doing the opposite. Walking slowly through markets, touching fabric, choosing only what felt like me rather than like everyone.

These are the first pieces. Each comes in the colours I could not choose between, in the sizes we have. More will follow, and one day, my own designs.

I hope one of them feels like you.`;

const STYLES: Style[] = [
  {
    pieceName: "Neem",
    name: "Linen wrap dress",
    category: "dresses",
    priceMinor: 349_900,
    material: "Linen blend",
    fit: "Relaxed, ties at the waist",
    care: "Hand wash cold, dry in shade",
    story: "A wrap dress in soft-washed linen that moves the moment you do.",
    stylingNote: "With flat kolhapuris and a single silver cuff. Leave the tie loose.",
    colours: [
      { name: "Sage", hex: "#8a8f6a" },
      { name: "Ivory", hex: "#ece4d3" },
      { name: "Rust", hex: "#a5532f" },
      { name: "Ink", hex: "#2c3140" },
    ],
    sizes: [
      { size: "S", measurements: { bustCm: 88, waistCm: 72, lengthCm: 116 } },
      { size: "M", measurements: { bustCm: 94, waistCm: 78, lengthCm: 118 } },
      { size: "L", measurements: { bustCm: 100, waistCm: 84, lengthCm: 120 } },
    ],
    stock: [
      [2, 3, 1],
      [1, 2, 0],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  {
    pieceName: "Saanjh",
    name: "Knit co-ord set",
    category: "co-ords",
    priceMinor: 459_900,
    compareAtMinor: 529_900,
    material: "Cotton knit",
    fit: "Boxy top, straight trousers",
    care: "Machine wash gentle",
    story: "A two-piece in a fine, breathable knit, the colour of evenings.",
    stylingNote: "Wear the top open over a camisole, or tucked with a thin gold belt.",
    colours: [
      { name: "Dusk", hex: "#7d6b6a" },
      { name: "Oat", hex: "#d8c8b0" },
      { name: "Olive", hex: "#6b6b46" },
      { name: "Plum", hex: "#5b1a2a" },
    ],
    sizes: [
      { size: "S", measurements: { bustCm: 100, waistCm: 70, lengthCm: 66 } },
      { size: "M", measurements: { bustCm: 106, waistCm: 76, lengthCm: 67 } },
    ],
    stock: [
      [1, 1],
      [2, 1],
      [0, 1],
      [1, 0],
    ],
  },
  {
    pieceName: "Kahwa",
    name: "Tailored blazer",
    category: "outerwear",
    priceMinor: 529_900,
    material: "Wool blend",
    fit: "Cut short, soft shoulder",
    care: "Dry clean",
    story: "The warm brown of Kashmiri kahwa, cut short with a soft shoulder.",
    stylingNote: "Over a slip dress, or with a white tee and straight trousers.",
    colours: [
      { name: "Kahwa", hex: "#6f4a35" },
      { name: "Charcoal", hex: "#3b3a3a" },
      { name: "Camel", hex: "#b08a5b" },
      { name: "Bone", hex: "#e7dcc8" },
    ],
    sizes: [{ size: "Free size", measurements: { bustCm: 104, shoulderCm: 40, lengthCm: 62 } }],
    stock: [[2], [1], [1], [0]],
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
        product_categories, product_collections, product_variants, products, categories, collections, suppliers
      restart identity cascade`);

    await db
      .insert(storeSettings)
      .values({ id: 1, lookbookTitle: "Autumn–Winter 2026", lookbookSubtitle: "The first pieces, in the colours we couldn't choose between.", note: NOTE, noteSignature: "Krishna", conciergeName: "Krishna" })
      .onConflictDoUpdate({
        target: storeSettings.id,
        set: { lookbookTitle: "Autumn–Winter 2026", lookbookSubtitle: "The first pieces, in the colours we couldn't choose between.", note: NOTE, noteSignature: "Krishna", conciergeName: "Krishna" },
      });

    const cats = await db.insert(categories).values(CATEGORIES).returning();
    const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const [market] = await db.insert(suppliers).values({ name: "Sample supplier", notes: "Development data" }).returning();

    let n = 0;
    let units = 0;
    for (const s of STYLES) {
      n++;
      const [p] = await db
        .insert(products)
        .values({
          name: s.name,
          slug: slugify(`${s.pieceName} ${s.name}`),
          pieceNumber: n,
          pieceName: s.pieceName,
          story: s.story,
          stylingNote: s.stylingNote,
          tone: s.colours[0]!.hex,
          description: "",
          status: "active",
          material: s.material,
          fit: s.fit,
          careInstructions: s.care,
          publishedAt: new Date(Date.now() - n * 86_400_000),
        })
        .returning();
      await db.insert(productCategories).values({ productId: p!.id, categoryId: bySlug.get(s.category)! });

      for (const [i, colour] of s.colours.entries()) {
        for (const [j, size] of s.sizes.entries()) {
          const onHand = s.stock[i]?.[j];
          if (onHand === undefined) continue;
          const [variant] = await db
            .insert(productVariants)
            .values({
              productId: p!.id,
              sku: `AST-${String(n).padStart(2, "0")}-${slugify(colour.name).toUpperCase()}-${slugify(size.size).toUpperCase()}`,
              color: colour.name,
              colorHex: colour.hex,
              size: size.size,
              priceMinor: s.priceMinor,
              compareAtMinor: s.compareAtMinor,
              measurements: size.measurements,
              condition: "new_with_tags",
              supplierId: market!.id,
              acquisitionCostMinor: Math.round(s.priceMinor * 0.45),
              acquiredAt: new Date(),
            })
            .returning();
          if (onHand > 0) {
            units += onHand;
            await db.transaction((tx) => adjustStock(tx, { variantId: variant!.id, delta: onHand, type: "receipt", reason: "Sample seed" }));
          }
        }
      }
    }
    console.log(`Seeded ${STYLES.length} sample styles, ${units} units in stock.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
