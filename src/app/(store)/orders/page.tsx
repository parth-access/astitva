import type { Metadata } from "next";
import { FindOrderForm } from "@/components/storefront/find-order-form";
import { whatsappLink } from "@/lib/format";
import { getConcierge } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Find your order",
  description: "Lost the link to your Astitva order? We'll email it to you again.",
  robots: { index: false, follow: true },
};

export default async function FindOrderPage() {
  const concierge = await getConcierge();
  const whatsappHref = concierge.whatsapp ? whatsappLink(concierge.whatsapp, "Hello, could you send me the link to my order? My order number is ") : null;
  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">Lost the link?</p>
      <h1 className="mt-2 text-5xl italic">Find your order</h1>
      <p className="mt-5 leading-relaxed text-espresso-soft">Tell us the order number and the mobile number you used, and we&apos;ll email you the page for your order.</p>
      <div className="mt-10">
        <FindOrderForm whatsappHref={whatsappHref} />
      </div>
    </div>
  );
}
