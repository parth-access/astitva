/**
 * Development seed: SAMPLE products only, so the storefront has something to
 * render. None of these are Krishna's real pieces. Refuses to run in production.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/create";
import { categories, productCategories, productVariants, products, suppliers, type Measurements } from "../src/db/schema";
import { adjustStock } from "../src/modules/inventory/service";

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
  name: string;
  category: string;
  featured?: boolean;
  material?: string;
  fit?: string;
  care?: string;
  description: string;
  variants: SampleVariant[];
};

const CATEGORIES = [
  { name: "Dresses", slug: "dresses", sortOrder: 1 },
  { name: "Co-ord sets", slug: "co-ords", sortOrder: 2 },
  { name: "Tops", slug: "tops", sortOrder: 3 },
  { name: "Outerwear", slug: "outerwear", sortOrder: 4 },
];

const SAMPLES: Sample[] = [
  {
    name: "Olive linen wrap dress",
    category: "dresses",
    featured: true,
    material: "Linen blend",
    fit: "Relaxed, ties at the waist",
    care: "Hand wash cold, dry in shade",
    description: "Sample product for development. A midi wrap dress in washed olive linen.",
    variants: [{ size: "M", priceMinor: 349_900, onHand: 1, condition: "new_with_tags", measurements: { bustCm: 96, waistCm: 78, lengthCm: 118 } }],
  },
  {
    name: "Burgundy satin slip dress",
    category: "dresses",
    featured: true,
    material: "Satin",
    fit: "Bias cut, skims the body",
    care: "Dry clean",
    description: "Sample product for development. A bias-cut slip dress with fine straps.",
    variants: [{ size: "S", priceMinor: 289_900, compareAtMinor: 349_900, onHand: 1, condition: "new", measurements: { bustCm: 86, waistCm: 72, lengthCm: 112 } }],
  },
  {
    name: "Ivory pleated co-ord set",
    category: "co-ords",
    featured: true,
    material: "Polyester crepe",
    fit: "Boxy shirt, straight trousers",
    care: "Machine wash gentle",
    description: "Sample product for development. A two-piece set: pleated shirt and wide trousers.",
    variants: [
      { size: "S", priceMinor: 459_900, onHand: 1, measurements: { bustCm: 100, waistCm: 70, lengthCm: 66 } },
      { size: "M", priceMinor: 459_900, onHand: 2, measurements: { bustCm: 106, waistCm: 76, lengthCm: 67 } },
      { size: "L", priceMinor: 459_900, onHand: 0, measurements: { bustCm: 112, waistCm: 82, lengthCm: 68 } },
    ],
  },
  {
    name: "Sand cotton kurta top",
    category: "tops",
    material: "Cotton",
    fit: "Straight, side slits",
    care: "Machine wash cold",
    description: "Sample product for development. A short kurta with a band collar.",
    variants: [{ size: "L", priceMinor: 179_900, onHand: 1, condition: "like_new", measurements: { bustCm: 108, lengthCm: 74 } }],
  },
  {
    name: "Espresso tailored blazer",
    category: "outerwear",
    featured: true,
    material: "Wool blend",
    fit: "Single breasted, slightly cropped",
    care: "Dry clean",
    description: "Sample product for development. A cropped blazer with a soft shoulder.",
    variants: [{ size: "M", priceMinor: 529_900, onHand: 1, condition: "gently_used", measurements: { bustCm: 98, shoulderCm: 39, sleeveCm: 58, lengthCm: 60 } }],
  },
  {
    name: "Champagne silk blouse",
    category: "tops",
    material: "Silk blend",
    fit: "Loose, dropped shoulder",
    care: "Hand wash cold",
    description: "Sample product for development. Shown as sold to preview the sold state.",
    variants: [{ size: "S", priceMinor: 249_900, onHand: 0, condition: "new", measurements: { bustCm: 104, lengthCm: 64 } }],
  },
  {
    name: "Taupe knit midi dress",
    category: "dresses",
    material: "Viscose knit",
    fit: "Fitted, stretch",
    care: "Hand wash cold, dry flat",
    description: "Sample product for development. A ribbed knit midi with a square neck.",
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
        product_categories, product_collections, product_variants, products, categories, collections, suppliers
      restart identity cascade`);

    const cats = await db.insert(categories).values(CATEGORIES).returning();
    const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const [market] = await db.insert(suppliers).values({ name: "Sample market supplier", notes: "Development data" }).returning();

    let i = 0;
    for (const s of SAMPLES) {
      const slug = slugify(s.name);
      const [p] = await db
        .insert(products)
        .values({
          name: s.name,
          slug,
          description: s.description,
          status: "active",
          isFeatured: s.featured ?? false,
          material: s.material,
          fit: s.fit,
          careInstructions: s.care,
          publishedAt: new Date(Date.now() - i++ * 86_400_000),
        })
        .returning();
      await db.insert(productCategories).values({ productId: p!.id, categoryId: bySlug.get(s.category)! });

      for (const v of s.variants) {
        const [variant] = await db
          .insert(productVariants)
          .values({
            productId: p!.id,
            sku: `AST-${slug.slice(0, 12).toUpperCase()}-${v.size ?? "OS"}`,
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
      }
    }
    console.log(`Seeded ${SAMPLES.length} sample products in ${CATEGORIES.length} categories.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
