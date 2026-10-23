import Link from "next/link";
import { ACROSS } from "@/lib/transition-types";
import { POLICY_PAGES } from "@/content/policies";
import { AnalyticsChoiceLink } from "./analytics";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-taupe/30 print:hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-10 pt-16 sm:px-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-display text-3xl italic">Astitva</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-espresso-soft">
            A few styles, chosen by hand, in the colours we couldn&apos;t choose between.
          </p>
        </div>
        <nav aria-label="The house" className="md:col-span-2 md:col-start-7">
          <h2 className="font-sans text-sm font-semibold">The house</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="link" transitionTypes={ACROSS} href="/about">About</Link>
            </li>
            <li>
              <Link className="link" transitionTypes={ACROSS} href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Help" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold">Help</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="link" transitionTypes={ACROSS} href="/size-guide">Size guide</Link>
            </li>
            <li>
              <Link className="link" transitionTypes={ACROSS} href="/faq">Questions</Link>
            </li>
            <li>
              <Link className="link" transitionTypes={ACROSS} href="/orders">Find your order</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Policies" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold">Policies</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {POLICY_PAGES.map((p) => (
              <li key={p.slug}>
                <Link className="link" transitionTypes={ACROSS} href={`/policies/${p.slug}`}>{p.title}</Link>
              </li>
            ))}
            <li>
              <AnalyticsChoiceLink className="link" />
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-espresso-soft sm:px-8">
        {/* The registered name is Astitva. No address is published; add the GSTIN here once there is one. */}
        &copy; Astitva. All rights reserved.
      </p>
    </footer>
  );
}
