import type { MetadataRoute } from "next";
import { POLICY_PAGES } from "@/content/policies";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { env } from "@/lib/env";
import { listCategories, listPieces } from "@/modules/catalog/queries";

/** Public pages only: the lookbook, the shop and its categories with pieces in them, every published piece, and the help and policy pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, "");
  const [pieces, categories] = await Promise.all([listPieces({ limit: 500 }), listCategories()]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
    ...categories.filter((c) => c.styles > 0).map((c) => ({ url: `${base}/shop/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.85 })),
    ...pieces.map((p) => ({
      url: `${base}/pieces/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      // The photo when there is one, otherwise the piece's share card.
      images: [p.imageUrl ? cloudinaryUrl(p.imageUrl, { width: 1600 }) : `${base}/pieces/${p.slug}/share.png`],
    })),
    ...["about", "contact", "faq", "size-guide"].map((path) => ({ url: `${base}/${path}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    // Draft policies are kept out of search until they're final.
    ...POLICY_PAGES.filter((p) => p.status === "final").map((p) => ({ url: `${base}/policies/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
