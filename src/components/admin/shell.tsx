import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./auth-forms";
import { HangerIcon, HomeIcon, OrdersIcon, SettingsIcon, ShopIcon, TagIcon } from "./icons";
import { NavLink } from "./nav-link";

type Item = { href: string; label: string; short: string; icon: ReactNode; exact?: boolean; ownersOnly?: boolean; badge?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Today", short: "Today", icon: <HomeIcon />, exact: true },
  { href: "/admin/orders", label: "Orders", short: "Orders", icon: <OrdersIcon />, badge: true },
  { href: "/admin/pieces", label: "Pieces", short: "Pieces", icon: <HangerIcon /> },
  { href: "/admin/discounts", label: "Discount codes", short: "Codes", icon: <TagIcon />, ownersOnly: true },
  { href: "/admin/settings", label: "Lookbook & settings", short: "Settings", icon: <SettingsIcon /> },
];

export type NavState = { owner: boolean; toCheck: number; name: string | null };

function Badge({ n, className = "" }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={`inline-grid min-w-5 place-items-center rounded-full bg-burgundy px-1.5 text-[0.7rem] font-medium leading-5 text-ivory tabular-nums ${className}`} aria-label={`${n} waiting`}>
      {n}
    </span>
  );
}

function Wordmark() {
  return (
    <Link href="/admin" className="block font-display text-sm tracking-[0.32em]">
      ASTITVA <span className="tracking-normal text-espresso-soft">admin</span>
    </Link>
  );
}

/** Desktop: a column down the left with the sections, and who's signed in at the foot. */
export function Sidebar({ state }: { state: NavState }) {
  return (
    <aside style={{ viewTransitionName: "admin-nav" }} className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sand/80 bg-champagne/45 px-4 py-7 lg:flex">
      <div className="px-3">
        <Wordmark />
      </div>
      <nav aria-label="Admin" className="mt-10">
        <ul className="space-y-1">
          {ITEMS.filter((i) => !i.ownersOnly || state.owner).map((i) => (
            <li key={i.href}>
              <NavLink
                href={i.href}
                exact={i.exact}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-espresso-soft transition-colors hover:bg-paper hover:text-espresso"
                activeClassName="!bg-paper !text-espresso font-medium shadow-[0_1px_2px_rgb(52_37_30/0.08)]"
              >
                {i.icon}
                <span className="flex-1">{i.label}</span>
                {i.badge ? <Badge n={state.toCheck} /> : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-4 px-3">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 text-sm text-espresso-soft hover:text-burgundy">
          <ShopIcon /> View the shop
        </a>
        <div className="border-t border-sand pt-4 text-sm">
          {state.name ? <p className="truncate font-medium">{state.name}</p> : <p className="skeleton h-4 w-24 rounded" />}
          <SignOutButton className="mt-1 text-xs text-espresso-soft hover:text-burgundy" />
        </div>
      </div>
    </aside>
  );
}

/** Phones and tablets: the wordmark on top, the sections as tabs along the bottom (where a thumb is). */
export function TopBar() {
  return (
    <header style={{ viewTransitionName: "site-header" }} className="sticky top-0 z-30 flex items-center justify-between border-b border-sand/80 bg-ivory/90 px-4 py-3.5 backdrop-blur lg:hidden">
      <Wordmark />
      <div className="flex items-center gap-4">
        <a href="/" target="_blank" rel="noopener" aria-label="View the shop" className="text-espresso-soft hover:text-burgundy">
          <ShopIcon />
        </a>
        <SignOutButton className="text-sm text-espresso-soft hover:text-burgundy" />
      </div>
    </header>
  );
}

export function BottomTabs({ state }: { state: NavState }) {
  const items = ITEMS.filter((i) => !i.ownersOnly || state.owner);
  return (
    <nav
      aria-label="Admin"
      style={{ viewTransitionName: "admin-tabs" }}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sand/80 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <li key={i.href}>
            <NavLink
              href={i.href}
              exact={i.exact}
              className="relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[0.7rem] text-espresso-soft"
              activeClassName="!text-burgundy font-medium"
            >
              {i.icon}
              {i.short}
              {i.badge ? <Badge n={state.toCheck} className="absolute left-1/2 top-1 ml-1.5" /> : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
