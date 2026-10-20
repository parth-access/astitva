import type { Metadata } from "next";
import { TextPage } from "@/components/storefront/text-page";

export const metadata: Metadata = {
  title: "Contact",
  description: "Ask Astitva about a piece, its fit or an order, on WhatsApp or by email.",
  alternates: { canonical: "/contact" },
};

// TODO(launch): read support email and WhatsApp number from store_settings once Krishna confirms them.
export default function ContactPage() {
  return (
    <TextPage title="Contact us" intro={<p>Questions about a piece, sizing or an order? We are happy to help.</p>}>
      <p>Our support email and WhatsApp number will be listed here before the store opens.</p>
      <p>When you write about an order, include your order number (it starts with AST) so we can find it quickly.</p>
    </TextPage>
  );
}
