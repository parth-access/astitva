import type { Metadata } from "next";
import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { JsonLd } from "@/components/brand/json-ld";
import { faqLd } from "@/lib/seo";
import { ACROSS } from "@/lib/transition-types";

export const metadata: Metadata = {
  title: "Questions",
  description: "Answers about Astitva's pieces, sizes, ordering, payment, delivery and returns.",
  alternates: { canonical: "/faq" },
};

const L = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link className="link text-espresso" href={href} transitionTypes={ACROSS}>
    {children}
  </Link>
);

/*
 * Every answer describes what the site actually does. Where a policy isn't
 * final (returns, delivery times), the answer points to its page rather than
 * promising anything.
 */
const SECTIONS: { id: string; title: string; faqs: { q: string; a: ReactNode }[] }[] = [
  {
    id: "ordering",
    title: "Ordering and paying",
    faqs: [
      {
        q: "Do I need an account to order?",
        a: (
          <>
            No. Add pieces to your bag and check out with your name, mobile number and address. An email is optional, but it&apos;s how your receipt and updates reach you. If
            you like, <L href="/account/sign-up">make an account</L> to see all your orders in one place, keep your addresses and save pieces for later.
          </>
        ),
      },
      {
        q: "How can I pay?",
        a: <>Checkout shows the ways to pay that are open: cash on delivery, and online by UPI, card or netbanking through Razorpay. You&apos;ll see the full total, delivery included, before you place the order.</>,
      },
      {
        q: "Is cash on delivery available everywhere?",
        a: <>For most pincodes and orders, yes. Checkout tells you if it isn&apos;t available for your pincode or for an order of that value.</>,
      },
      {
        q: "Is paying online safe?",
        a: <>Yes. Payments go through Razorpay&apos;s own secure window; your card or UPI details never reach us. Your order is marked paid only once Razorpay confirms the money arrived.</>,
      },
      {
        q: "My money was taken but my order doesn't show as paid.",
        a: <>Please don&apos;t pay again. Message us with your order number. If a payment ever reaches us without becoming an order, it&apos;s refunded to the way you paid.</>,
      },
      {
        q: "How do discount codes work?",
        a: <>Tap &ldquo;Have a code?&rdquo; at checkout. One code per order; it comes off the pieces, not delivery. Some codes have dates, a minimum order or can be used once per mobile number, and checkout tells you if one doesn&apos;t apply.</>,
      },
      {
        q: "Can I change or cancel my order?",
        a: (
          <>
            Message us as soon as you can, with your order number. Before it&apos;s packed, we can usually help with a change or cancel it. Once it&apos;s with the courier, it can&apos;t be cancelled. See our{" "}
            <L href="/policies/cancellation">cancellation policy</L>.
          </>
        ),
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    faqs: [
      {
        q: "Where do you deliver?",
        a: <>Within India, for now. Checkout checks your pincode before you order.</>,
      },
      {
        q: "How much does delivery cost, and how long does it take?",
        a: (
          <>
            Delivery is shown at checkout before you pay. Times depend on where you are; see our <L href="/policies/shipping">shipping policy</L>.
          </>
        ),
      },
      {
        q: "Where's my order?",
        a: (
          <>
            Every order has its own private page, linked from your order email. It shows each step, and the courier and tracking number once it&apos;s sent. Lost the link?{" "}
            <L href="/orders">Find your order</L>.
          </>
        ),
      },
      {
        q: "Does it come gift-ready?",
        a: <>Every piece is wrapped by hand, with a card bearing its number and name. If it&apos;s a gift, tell us in the note at checkout.</>,
      },
    ],
  },
  {
    id: "fit",
    title: "Fit, colour and care",
    faqs: [
      {
        q: "How do I know it will fit?",
        a: (
          <>
            Every piece lists its garment measurements in centimetres, measured flat. Our <L href="/size-guide">size guide</L> shows how to compare them with your own, or send us your
            measurements and we&apos;ll suggest a size.
          </>
        ),
      },
      {
        q: "Will the colour look like it does on my screen?",
        a: <>Screens show colours a little differently. If you&apos;re between two, ask us: we&apos;re happy to describe them or send another photo.</>,
      },
      {
        q: "Will a sold-out colour or size come back?",
        a: <>Often, yes. Choose it on the piece&apos;s page and tap &ldquo;Tell me when it&apos;s back&rdquo;: we&apos;ll email you once, the moment it can be bought again.</>,
      },
      {
        q: "How do I care for my piece?",
        a: <>Each piece&apos;s page has its fabric and care instructions, and they&apos;re in your shipping email too.</>,
      },
    ],
  },
  {
    id: "after",
    title: "Returns and help",
    faqs: [
      {
        q: "Can I return or exchange a piece?",
        a: (
          <>
            See our <L href="/policies/returns">returns and exchanges</L> page. If something isn&apos;t right when it arrives, message us with a photo and we&apos;ll help.
          </>
        ),
      },
      {
        q: "When will I get my refund?",
        a: <>A refund to a card or UPI usually shows in your account within 5 to 7 working days of us sending it; we email you when we do. For cash orders, we refund by UPI or bank transfer.</>,
      },
      {
        q: "How do I reach you?",
        a: (
          <>
            WhatsApp is quickest, or email. Both are on our <L href="/contact">contact page</L>.
          </>
        ),
      },
    ],
  },
];

/** An answer's words without its links, for the structured data: the same text the page shows. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <JsonLd data={faqLd(SECTIONS.flatMap((s) => s.faqs.map((f) => ({ question: f.q, answer: textOf(f.a).replace(/\s+/g, " ").trim() }))))} />
      <p className="caption text-xl">Before you ask</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Questions</h1>
      <nav aria-label="Topics" className="mt-8 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-taupe/50 px-4 py-1.5 text-sm transition-colors hover:border-espresso">
            {s.title}
          </a>
        ))}
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-14 scroll-mt-8">
          <h2 id={`${s.id}-h`} className="caption text-2xl">
            {s.title}
          </h2>
          <div className="mt-4 divide-y divide-taupe/40 border-y border-taupe/40">
            {s.faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-display text-xl leading-snug [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="mt-1 shrink-0 text-2xl leading-none text-espresso-soft transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-3 max-w-2xl leading-relaxed text-espresso-soft">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-16 text-center text-espresso-soft">
        Didn&apos;t find it? <L href="/contact">Ask us</L>.
      </p>
    </div>
  );
}
