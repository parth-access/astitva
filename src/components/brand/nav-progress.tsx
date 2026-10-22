"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * A thin bar across the top while the next page loads. It starts the moment
 * a link to another page is clicked (so a slow page still answers the click
 * at once) and finishes when the address changes. Clicking again while it
 * runs keeps the same bar going.
 */
export function NavProgress() {
  return (
    // Reading the query string needs a boundary of its own.
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

type Phase = "idle" | "loading" | "done";

/** Where a click on this element would take the page, if it's a page of ours other than this one. */
function destination(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin) return null;
  // Same page (or only a jump within it): nothing loads.
  if (to.pathname === location.pathname && to.search === location.search) return null;
  return to;
}

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!destination(e)) return;
      clear();
      // A page that arrives at once doesn't need a bar; one that doesn't gets it almost straight away.
      timers.current.push(window.setTimeout(() => setPhase("loading"), 80));
      // Never left running: a link that turns out to go nowhere, or a failed load.
      timers.current.push(window.setTimeout(() => setPhase("idle"), 15_000));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The address changed: the new page is here.
  useEffect(() => {
    clear();
    // The router has no "navigation finished" event; the new address is it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase((p) => (p === "loading" ? "done" : "idle"));
    timers.current.push(window.setTimeout(() => setPhase("idle"), 400));
    return clear;
  }, [pathname, search]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-navigating", phase === "loading");
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div role="progressbar" aria-label="Loading the page" aria-busy={phase === "loading"} className="nav-progress" data-phase={phase}>
      <span />
    </div>
  );
}
