import type { Metadata } from "next";
import Link from "next/link";
import { TextPage } from "@/components/storefront/text-page";

export const metadata: Metadata = { title: "Questions", description: "Answers to common questions about Astitva." };

// Answers that depend on undecided policies point to the policy pages instead of guessing.
const faqs = [
  {
    q: "What does “one of one” mean?",
    a: <>There is only one of that piece. Once someone buys it, it is gone, so we mark it sold rather than restocking it.</>,
  },
  {
    q: "Are the pieces new?",
    a: <>Each product page states the condition of that exact piece.</>,
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
