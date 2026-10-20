import type { Metadata } from "next";
import Link from "next/link";
import { TextPage } from "@/components/storefront/text-page";

export const metadata: Metadata = { title: "Questions", description: "Answers to common questions about Astitva." };

// Answers that depend on undecided policies point to the policy pages instead of guessing.
const faqs = [
  {
    q: "Will a sold-out colour come back?",
    a: <>Often, yes. Sold-out colours and sizes stay on the piece&apos;s page, marked, so you can see what we make. Ask Krishna on WhatsApp if you&apos;re waiting for one.</>,
  },
  {
    q: "How do I know it will fit?",
    a: (
      <>
        Every product lists its garment measurements in centimetres. Our <Link className="link" href="/size-guide">size guide</Link>{" "}
        shows how to compare them with your own.
      </>
    ),
  },
  {
    q: "Can I return or exchange a piece?",
    a: (
      <>
        See our <Link className="link" href="/policies/returns">returns and exchanges</Link> page.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <TextPage title="Questions">
      <dl>
        {faqs.map((f) => (
          <div key={f.q} className="border-b border-taupe/40 py-6 first:pt-0">
            <dt className="font-display text-xl">{f.q}</dt>
            <dd className="mt-2 text-espresso-soft">{f.a}</dd>
          </div>
        ))}
      </dl>
    </TextPage>
  );
}
