import Link from "next/link";
import { POLICY_PAGES } from "@/content/policies";
import { Monogram } from "./monogram";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-taupe/40 bg-champagne/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-[1fr_auto_auto] sm:px-8">
        <div className="flex items-start gap-4">
          <Monogram className="h-14 w-auto text-gold" />
          <div>
            <p className="font-accent text-xl italic">Your true form</p>
            <p className="mt-2 max-w-xs text-sm text-espresso-soft">
              Curated womenswear, chosen piece by piece in India.
            </p>
          </div>
        </div>
        <nav aria-label="Help">
          <h2 className="font-sans text-sm font-semibold">Help</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="link" href="/contact">Contact us</Link>
            </li>
            <li>
              <Link className="link" href="/size-guide">Size guide</Link>
            </li>
            <li>
              <Link className="link" href="/faq">Questions</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Policies">
          <h2 className="font-sans text-sm font-semibold">Policies</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {POLICY_PAGES.map((p) => (
              <li key={p.slug}>
                <Link className="link" href={`/policies/${p.slug}`}>{p.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-espresso-soft sm:px-8">
        {/* TODO(launch): registered business name, address and GSTIN if registered. */}
        Astitva. Business details will appear here before launch.
      </p>
    </footer>
  );
}
