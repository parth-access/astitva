import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
  async redirects() {
    // Pieces used to live at /products/<slug>.
    return [
      { source: "/products/:slug", destination: "/pieces/:slug", permanent: true },
      // The first three pieces kept the sample products' addresses until migration 0021.
      { source: "/pieces/neem-linen-wrap-dress/:rest*", destination: "/pieces/the-muse-knit/:rest*", permanent: true },
      { source: "/pieces/saanjh-knit-co-ord-set/:rest*", destination: "/pieces/the-cloud-comfort/:rest*", permanent: true },
      { source: "/pieces/kahwa-tailored-blazer/:rest*", destination: "/pieces/the-good-mood-club/:rest*", permanent: true },
      // Chapters and the archive were retired: the home page is the lookbook.
      { source: "/chapters/:slug", destination: "/", permanent: true },
      { source: "/archive", destination: "/", permanent: true },
      // Categories have their own pages now: /shop?category=dresses → /shop/dresses.
      { source: "/shop", has: [{ type: "query", key: "category", value: "(?<category>[a-z0-9-]+)" }], destination: "/shop/:category", permanent: true },
    ];
  },
};

export default nextConfig;
