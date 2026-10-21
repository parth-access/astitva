import type { Metadata } from "next";
import Link from "next/link";
import { whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { ACROSS } from "@/lib/transition-types";
import { getConcierge } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Contact",
  description: "Ask Astitva about a piece, its fit or an order, on WhatsApp or by email.",
  alternates: { canonical: "/contact" },
};

/** "919812345678" → "+91 98123 45678"; other countries as given. */
function showWhatsapp(n: string) {
  return n.length === 12 && n.startsWith("91") ? formatMobile(n.slice(2)) : `+${n}`;
}

const card = "group block rounded-3xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] p-7 transition-colors hover:border-espresso sm:p-8";

/** WhatsApp and email come from Lookbook & settings in the admin. */
export default async function ContactPage() {
  const c = await getConcierge();
  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">We&apos;d love to hear from you</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Contact us</h1>
      <p className="mt-5 max-w-xl leading-relaxed text-espresso-soft">
        A question about a piece, how it fits, or an order on its way? Write to us. A real person reads every message and replies as soon as we can.
      </p>

      {c.whatsapp || c.email ? (
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {c.whatsapp ? (
            <a href={whatsappLink(c.whatsapp, "Hello Astitva, ")} target="_blank" rel="noopener noreferrer" className={card}>
              <span className="caption text-lg">The quickest way</span>
              <span className="mt-1 block font-display text-3xl italic group-hover:text-burgundy">WhatsApp</span>
              <span className="mt-4 block text-lg tabular-nums">{showWhatsapp(c.whatsapp)}</span>
              <span className="mt-1 block text-sm text-espresso-soft">For fit, colours, sizes and orders. Photos welcome.</span>
              <span className="mt-6 inline-block text-sm font-medium text-burgundy">Message us →</span>
            </a>
          ) : null}
          {c.email ? (
            <a href={`mailto:${c.email}`} className={card}>
              <span className="caption text-lg">For anything longer</span>
              <span className="mt-1 block font-display text-3xl italic group-hover:text-burgundy">Email</span>
              <span className="mt-4 block break-all text-lg">{c.email}</span>
              <span className="mt-1 block text-sm text-espresso-soft">Returns, collaborations, or a note to say hello.</span>
              <span className="mt-6 inline-block text-sm font-medium text-burgundy">Write to us →</span>
            </a>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Before you write" className="mt-16 grid gap-10 border-t border-taupe/40 pt-10 text-sm sm:grid-cols-3">
        <div>
          <h2 className="caption text-lg">About an order</h2>
          <p className="mt-2 leading-relaxed text-espresso-soft">
            Tell us your order number (it starts with AST-) and we&apos;ll find it straight away. To see where it is yourself,{" "}
            <Link href="/orders" transitionTypes={ACROSS} className="link text-espresso">
              find your order
            </Link>
            .
          </p>
        </div>
        <div>
          <h2 className="caption text-lg">About the fit</h2>
          <p className="mt-2 leading-relaxed text-espresso-soft">
            Each piece lists its measurements in centimetres. The{" "}
            <Link href="/size-guide" transitionTypes={ACROSS} className="link text-espresso">
              size guide
            </Link>{" "}
            shows how to compare them with your own, or send us yours and we&apos;ll suggest a size.
          </p>
        </div>
        <div>
          <h2 className="caption text-lg">Quick answers</h2>
          <p className="mt-2 leading-relaxed text-espresso-soft">
            Payment, delivery, returns and more are in{" "}
            <Link href="/faq" transitionTypes={ACROSS} className="link text-espresso">
              questions
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
