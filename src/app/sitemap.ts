import type { MetadataRoute } from "next";
import { POLICY_PAGES } from "@/content/policies";
import { env } from "@/lib/env";
import { listPieces } from "@/modules/catalog/queries";

/** Public pages only: the lookbook, the shop, every published piece, and the help and policy pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, "");
  const pieces = await listPieces({ limit: 500 });
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
    ...pieces.map((p) => ({ url: `${base}/pieces/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["about", "contact", "faq", "size-guide"].map((path) => ({ url: `${base}/${path}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    ...POLICY_PAGES.map((p) => ({ url: `${base}/policies/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
