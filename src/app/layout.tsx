import type { Metadata, Viewport } from "next";
import { cormorant, montserrat, playfair } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Astitva — Your True Form", template: "%s | Astitva" },
  description: "Curated womenswear, chosen piece by piece. Many of our pieces are one of one.",
  openGraph: { siteName: "Astitva", type: "website", locale: "en_IN" },
};

export const viewport: Viewport = {
  themeColor: "#f7f1e7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${playfair.variable} ${montserrat.variable} ${cormorant.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
