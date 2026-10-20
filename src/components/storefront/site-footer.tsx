import Link from "next/link";
import { POLICY_PAGES } from "@/content/policies";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-taupe/30">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-10 pt-16 sm:px-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-display text-3xl italic">Your true form</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-espresso-soft">
            Clothes chosen by hand, one piece at a time. Most exist only once.
          </p>
        </div>
        <nav aria-label="The house" className="md:col-span-2 md:col-start-7">
          <h2 className="font-sans text-sm font-semibold">The house</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="link" href="/about">About</Link>
            </li>
            <li>
              <Link className="link" href="/archive">Archive</Link>
            </li>
            <li>
              <Link className="link" href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Help" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold">Help</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="link" href="/size-guide">Size guide</Link>
            </li>
            <li>
              <Link className="link" href="/faq">Questions</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Policies" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold">Policies</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {POLICY_PAGES.map((p) => (
              <li key={p.slug}>
                <Link className="link" href={`/policies/${p.slug}`}>{p.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-espresso-soft sm:px-8">
        {/* TODO(launch): registered business name, address and GSTIN if registered. */}
        Astitva. Business details will appear here before launch.
      </p>
    </footer>
  );
}
