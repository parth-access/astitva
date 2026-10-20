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
    return [
      { source: "/products/:slug", destination: "/pieces/:slug", permanent: true },
      // Chapters and the archive were retired: the home page is the lookbook.
      { source: "/chapters/:slug", destination: "/", permanent: true },
      { source: "/archive", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
