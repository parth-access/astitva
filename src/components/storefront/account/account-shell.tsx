import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(store)/account/actions";
import { ACROSS } from "@/lib/transition-types";
import { SubmitButton } from "./pending";

const TABS = [
  { key: "orders", href: "/account", label: "Orders" },
  { key: "addresses", href: "/account/addresses", label: "Addresses" },
  { key: "details", href: "/account/details", label: "Your details" },
] as const;

export type AccountTab = (typeof TABS)[number]["key"];

/** The account's heading and tabs. The current tab is passed in (no usePathname, so pages stay streamable). */
export function AccountShell({ current, children }: { current: AccountTab; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="caption text-xl">Your account</p>
          <h1 className="mt-2 text-5xl italic md:text-6xl">{TABS.find((t) => t.key === current)!.label}</h1>
        </div>
        <form action={signOutAction}>
          <SubmitButton className="link text-sm text-espresso-soft" pending="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </div>
      <nav aria-label="Your account" className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            transitionTypes={ACROSS}
            aria-current={t.key === current ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${t.key === current ? "border-espresso bg-espresso text-ivory" : "border-taupe/50 hover:border-espresso"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-10">{children}</div>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}
