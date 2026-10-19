import type { NextConfig } from "next";

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
  async redirects() {
    // Pieces used to live at /products/<slug>.
    return [{ source: "/products/:slug", destination: "/pieces/:slug", permanent: true }];
  },
};

export default nextConfig;
