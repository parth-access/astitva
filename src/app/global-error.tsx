"use client";

import { ErrorView } from "@/components/brand/error-view";
import { cormorant, montserrat, playfair } from "./fonts";
import "./globals.css";

/** The root layout itself broke, so this draws its own document. */
export default function GlobalError(props: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-IN" className={`${playfair.variable} ${montserrat.variable} ${cormorant.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <main className="flex flex-1 flex-col">
          <ErrorView {...props} />
        </main>
      </body>
    </html>
  );
}
