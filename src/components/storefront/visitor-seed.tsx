"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Bag } from "@/modules/bag/types";
import { useBag } from "./bag/bag-context";
import { useSaved } from "./saved/saved-context";

const REFRESH = "astitva:visitor";

/** Ask for the bag and hearts again, after something on the server changed them. */
export function refreshVisitor() {
  window.dispatchEvent(new Event(REFRESH));
}

/** Pages where signing in or paying changes the bag or hearts. Elsewhere, they can't have changed. */
const changesVisitor = (path: string | null) => !!path && /^\/(account|checkout|orders)(\/|$)/.test(path);

/**
 * Fills in the bag and hearts once the page has loaded. They depend on the
 * visitor's cookies, so reading them here is what lets the page be cached.
 */
export function VisitorSeed() {
  const { seed: seedBag, bump } = useBag();
  const { seed: seedSaved } = useSaved();
  const pathname = usePathname();
  const [asked, setAsked] = useState(0);

  // Leaving or entering a page that may have changed them asks again.
  const lastPath = useRef(pathname);
  useEffect(() => {
    const before = lastPath.current;
    lastPath.current = pathname;
    if (before !== pathname && (changesVisitor(before) || changesVisitor(pathname))) setAsked((n) => n + 1);
  }, [pathname]);

  useEffect(() => {
    const again = () => setAsked((n) => n + 1);
    window.addEventListener(REFRESH, again);
    return () => window.removeEventListener(REFRESH, again);
  }, []);

  // Something added while this was on its way is newer than its answer.
  const latestBump = useRef(bump);
  useEffect(() => {
    latestBump.current = bump;
  }, [bump]);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = latestBump.current;
    fetch("/api/visitor", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ bag: Bag; saved: string[] }>) : null))
      .then((visitor) => {
        if (!visitor) return;
        if (latestBump.current === startedAt) seedBag(visitor.bag);
        seedSaved(visitor.saved);
      })
      // The page works without them: the next change brings the bag back.
      .catch(() => {});
    return () => controller.abort();
  }, [asked, seedBag, seedSaved]);

  return null;
}
