import Link from "next/link";
import { ACROSS, BACK } from "@/lib/transition-types";
import { BagButton } from "./bag/bag-button";
import { MenuDisclosure } from "./menu-disclosure";

const left = [
  { href: "/#pieces", label: "Lookbook" },
  { href: "/shop", label: "Shop" },
];
const right = [
  { href: "/size-guide", label: "Size guide" },
  { href: "/about", label: "About" },
];

/**
 * A masthead: the wordmark centred like a magazine title, navigation split
 * either side, the account and the bag at the far right. On phones the
 * links fold into a disclosure (no JavaScript needed).
 */
export function SiteHeader({ notice }: { notice?: string | null }) {
  return (
    // Named so it stays still while the page under it changes. The name makes
    // it a layer of its own, so it's lifted above the page for the menu.
    <header className="relative z-30 print:hidden" style={{ viewTransitionName: "site-header" }}>
      {notice ? <p className="bg-espresso px-4 py-2 text-center text-xs text-ivory">{notice}</p> : null}
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-6 sm:px-8 md:py-8">
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-8 text-sm">
            {left.map((item) => (
              <li key={item.href}>
                <Link href={item.href} transitionTypes={ACROSS} className="link no-underline hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <MenuDisclosure className="group relative md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
          </summary>
          <nav aria-label="Main" className="absolute left-0 top-full z-50 mt-2 w-56 bg-ivory py-3 shadow-[0_10px_30px_-12px_rgb(52_37_30/0.35)]">
            <ul>
              {[...left, ...right, { href: "/contact", label: "Contact" }, { href: "/account", label: "Your account" }].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} transitionTypes={ACROSS} className="block px-4 py-2.5 font-display text-xl hover:text-burgundy">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </MenuDisclosure>

        <Link href="/" transitionTypes={BACK} className="justify-self-center text-center" aria-label="Astitva, home">
          <span className="block font-display text-2xl tracking-[0.42em] [margin-right:-0.42em] md:text-3xl">ASTITVA</span>
          <span className="mt-1 block font-accent text-sm italic text-espresso-soft md:text-base">Your true form</span>
        </Link>

        <div className="flex items-center gap-8 justify-self-end">
          <nav aria-label="Secondary" className="hidden md:block">
            <ul className="flex gap-8 text-sm">
              {right.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} transitionTypes={ACROSS} className="link no-underline hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {/* On phones it's in the menu: the masthead has no room beside the bag. */}
          <Link href="/account" transitionTypes={ACROSS} aria-label="Your account" title="Your account" className="-mx-2 hidden size-11 place-items-center text-espresso hover:text-burgundy md:grid">
            {/* A head and shoulders. */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.75" />
              <path d="M4.75 20c.9-3.7 3.8-5.75 7.25-5.75s6.35 2.05 7.25 5.75" strokeLinecap="round" />
            </svg>
          </Link>
          <BagButton />
        </div>
      </div>
    </header>
  );
}
