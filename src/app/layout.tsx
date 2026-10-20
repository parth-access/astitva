import type { Metadata, Viewport } from "next";
import { IntroBoot } from "@/components/brand/intro";
import { cormorant, montserrat, playfair } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Astitva — Your true form", template: "%s | Astitva" },
  description: "Womenswear by Astitva: a few considered styles, each in the colours we couldn't choose between. See the lookbook and shop online.",
  applicationName: "Astitva",
  category: "fashion",
  openGraph: { siteName: "Astitva", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
  // Order numbers and prices aren't phone numbers.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f1e7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the intro boot script sets data-intro on <html> before React hydrates.
    <html
      lang="en-IN"
      className={`${playfair.variable} ${montserrat.variable} ${cormorant.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <IntroBoot />
      </head>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
