import localFont from "next/font/local";

// Self-hosted (OFL) so builds never depend on Google Fonts. See src/fonts/LICENSE.md.
export const playfair = localFont({
  variable: "--font-playfair",
  display: "swap",
  src: [
    { path: "../fonts/playfair-display-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "../fonts/playfair-display-latin-wght-italic.woff2", weight: "400 900", style: "italic" },
  ],
  fallback: ["Georgia", "serif"],
});

export const montserrat = localFont({
  variable: "--font-montserrat",
  display: "swap",
  src: [{ path: "../fonts/montserrat-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  fallback: ["system-ui", "sans-serif"],
});

export const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
  src: [
    { path: "../fonts/cormorant-infant-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/cormorant-infant-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/cormorant-infant-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  fallback: ["Georgia", "serif"],
});
