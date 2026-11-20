import type { Metadata } from "next";
import Link from "next/link";
import { TextPage } from "@/components/storefront/text-page";
import { GUIDES } from "@/content/guides";
import { pageMeta } from "@/lib/seo";
import { ACROSS } from "@/lib/transition-types";

export const metadata: Metadata = pageMeta({
  title: "Styling guides",
  description: "How to wear Astitva's pieces: co-ord sets, winter sweaters and what to pair them with.",
  path: "/guides",
});

export default function GuidesPage() {
  return (
    <TextPage title="Styling guides" intro={<p>Ways to wear the pieces, and what to wear them with.</p>}>
      <ul className="not-prose space-y-10">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`} transitionTypes={ACROSS} className="group block">
              <h2 className="font-display text-3xl group-hover:underline">{g.title}</h2>
              <p className="mt-2 max-w-xl text-espresso-soft">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </TextPage>
  );
}
