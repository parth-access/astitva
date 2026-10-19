import Link from "next/link";

const nav = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-taupe/40">
      <p className="bg-espresso px-4 py-2 text-center text-xs text-ivory">
        Preview: the store is not taking orders yet.
      </p>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-5 sm:px-8">
        <Link href="/" className="font-display text-xl tracking-[0.28em] sm:text-2xl" aria-label="Astitva, home">
          ASTITVA
        </Link>
        <nav aria-label="Main">
          <ul className="flex gap-5 text-sm sm:gap-8">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="link no-underline hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
