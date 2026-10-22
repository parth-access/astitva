"use client";

import type { ReactNode } from "react";

/**
 * The phone menu: a plain <details>, so it opens without JavaScript. The
 * header stays put between pages, so with JavaScript it shuts itself when
 * one of its links is followed instead of staying open over the next page.
 */
export function MenuDisclosure({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <details
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.currentTarget.open = false;
      }}
    >
      {children}
    </details>
  );
}
