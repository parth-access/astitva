"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ACROSS } from "@/lib/transition-types";

/** A link in the admin's navigation that knows when you're in its section. */
export function NavLink({ href, exact = false, className, activeClassName, children }: { href: string; exact?: boolean; className: string; activeClassName: string; children: ReactNode }) {
  const pathname = usePathname();
  const on = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} transitionTypes={ACROSS} aria-current={on ? "page" : undefined} className={`${className} ${on ? activeClassName : ""}`}>
      {children}
    </Link>
  );
}
