import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Search engines may read the shop; the admin, checkout, buyers' order pages and the API stay out. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/checkout", "/orders/", "/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
