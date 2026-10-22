import type { Metadata } from "next";
import { FindOrderForm } from "@/components/storefront/find-order-form";
import { OrdersOnDevice } from "@/components/storefront/orders-on-device";
import { whatsappLink } from "@/lib/format";
import { getConcierge } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Find your order",
  description: "See where your Astitva order is, or have its private page emailed to you again.",
  robots: { index: false, follow: true },
};

/**
 * Where a buyer comes to see their order again. Orders already opened in
 * this browser are a tap away at the top; otherwise the order number and
 * mobile number get the private page emailed.
 */
export default async function FindOrderPage() {
  const concierge = await getConcierge();
  const who = concierge.name ?? "us";
  const whatsappHref = concierge.whatsapp ? whatsappLink(concierge.whatsapp, "Hello Astitva, could you help me find my order? ") : null;
  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">Where&apos;s my order?</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Find your order</h1>
      <p className="mt-5 leading-relaxed text-espresso-soft">See where it is, what you ordered and how it&apos;s being paid for, on its own private page.</p>

      <div className="mt-12">
        <OrdersOnDevice />

        <section aria-labelledby="by-number" className="rounded-3xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] p-6 shadow-[0_18px_40px_-30px_rgb(52_37_30/0.45)] sm:p-9">
          <h2 id="by-number" className="font-display text-3xl italic">
            Get the link again
          </h2>
          <p className="mb-7 mt-2 text-sm leading-relaxed text-espresso-soft">Your order number and the mobile number you ordered with. We&apos;ll email you its page.</p>
          <FindOrderForm whatsapp={concierge.whatsapp} />
        </section>

        <section aria-label="Help" className="mt-14 grid gap-8 text-sm sm:grid-cols-2">
          <div>
            <h2 className="caption text-lg">Where&apos;s the order number?</h2>
            <p className="mt-2 leading-relaxed text-espresso-soft">
              It starts with AST-, like AST-001005. It&apos;s in the subject of the email we sent when you ordered.
            </p>
          </div>
          <div>
            <h2 className="caption text-lg">No email on the order?</h2>
            <p className="mt-2 leading-relaxed text-espresso-soft">
              {whatsappHref ? (
                <>
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="link text-espresso">
                    Message {who} on WhatsApp
                  </a>{" "}
                  from the number you ordered with, and we&apos;ll send the link there.
                </>
              ) : (
                `Message ${who} from the number you ordered with, and we'll send the link there.`
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
