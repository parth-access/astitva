"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { cleanReferrer, cleanUrl, GA_ID } from "@/lib/analytics";

/**
 * Google Analytics, only with the visitor's yes. Until they answer, nothing
 * from Google loads and no cookie is set; "No" keeps it that way, and the
 * choice can be changed from the foot of every page. The answer lives in
 * this browser (localStorage).
 *
 * Page views are sent by hand, with the address cleaned (lib/analytics.ts),
 * so an order page's private key never leaves the site. The storefront only:
 * the admin has no tracking.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type Choice = "yes" | "no";
const KEY = "astitva:analytics";
const CHANGED = "astitva:analytics-changed";
const ASK = "astitva:analytics-ask";
const COUNTED = "astitva:analytics-counted";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** "unknown" while rendering on the server, so the banner only ever appears in the browser. */
function useChoice(): Choice | null | "unknown" {
  return useSyncExternalStore(subscribe, readChoice, () => "unknown");
}

function choose(choice: Choice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the answer holds for this page only.
  }
  if (choice === "yes") {
    start();
    pageView();
    flush();
  } else {
    stop();
    forgetCookies();
    pending = [];
  }
  window.dispatchEvent(new Event(CHANGED));
}

// ---------------------------------------------------------------------------
// gtag

const disableFlag = () => `ga-disable-${GA_ID}` as const;
let lastLocation: string | null = null;

function gtag(...args: unknown[]) {
  window.gtag?.(...args);
}

function start() {
  if (!GA_ID) return;
  // Google's own switch: while true, gtag sends nothing.
  (window as unknown as Record<string, boolean>)[disableFlag()] = false;
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads each call's `arguments` object; an array doesn't work.
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  gtag("js", new Date());
  gtag("config", GA_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: cleanUrl(location.href, location.origin),
    page_referrer: cleanReferrer(document.referrer, location.origin),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.append(script);
}

function stop() {
  if (GA_ID) (window as unknown as Record<string, boolean>)[disableFlag()] = true;
}

/** Analytics' cookies (_ga, _ga_…), set on this host or the domain above it. */
function forgetCookies() {
  const names = document.cookie.split(";").map((c) => c.split("=")[0]!.trim()).filter((n) => n.startsWith("_ga"));
  const parts = location.hostname.split(".");
  const domains = ["", ...parts.map((_, i) => `; domain=.${parts.slice(i).join(".")}`)];
  for (const name of names) for (const d of domains) document.cookie = `${name}=; max-age=0; path=/${d}`;
}

function pageView() {
  if (!window.gtag) return;
  const here = cleanUrl(location.href, location.origin);
  if (here === lastLocation) return;
  gtag("set", { page_location: here, page_referrer: lastLocation ?? cleanReferrer(document.referrer, location.origin) });
  gtag("event", "page_view");
  lastLocation = here;
}

// ---------------------------------------------------------------------------
// Events

type Pending = { name: string; params: Record<string, unknown>; onceKey?: string };
/** Events from before the visitor answered: sent if they say yes on this page. */
let pending: Pending[] = [];
let lastEvent = { key: "", at: 0 };

function counted(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(COUNTED) ?? "[]");
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function send({ name, params, onceKey }: Pending) {
  if (onceKey) {
    const list = counted();
    if (list.includes(onceKey)) return;
    try {
      localStorage.setItem(COUNTED, JSON.stringify([onceKey, ...list].slice(0, 50)));
    } catch {}
  }
  // The address as of now, in case this page's own view hasn't been sent yet.
  gtag("event", name, { ...params, page_location: cleanUrl(location.href, location.origin) });
}

function flush() {
  const queued = pending;
  pending = [];
  queued.forEach(send);
}

/**
 * Sends an e-commerce or other event. With no answer yet it waits for one;
 * after a "No" it goes nowhere. `onceKey` sends it at most once per browser
 * (an order's purchase, however often its page is opened).
 */
export function track(name: string, params: Record<string, unknown>, onceKey?: string) {
  if (!GA_ID) return;
  // The same event again at once is one event (a page mounted twice), not two.
  const key = JSON.stringify([name, params, onceKey]);
  if (key === lastEvent.key && performance.now() - lastEvent.at < 1000) return;
  lastEvent = { key, at: performance.now() };
  const choice = readChoice();
  if (choice === "no") return;
  if (choice === "yes" && window.gtag) send({ name, params, onceKey });
  else pending.push({ name, params, onceKey });
}

/** Sends an event once when it renders (and again if its details change). */
export function Track({ event, params, onceKey }: { event: string; params: Record<string, unknown>; onceKey?: string }) {
  const key = JSON.stringify([event, params, onceKey]);
  useEffect(() => {
    const [e, p, o] = JSON.parse(key) as [string, Record<string, unknown>, string | undefined];
    track(e, p, o);
  }, [key]);
  return null;
}

// ---------------------------------------------------------------------------
// The banner and page views

export function Analytics() {
  if (!GA_ID) return null;
  return (
    // Reading the query string needs a boundary of its own.
    <Suspense fallback={null}>
      <PageViews />
      <ConsentBanner />
    </Suspense>
  );
}

function PageViews() {
  const choice = useChoice();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (choice !== "yes") return;
    start();
    pageView();
    flush();
  }, [choice, pathname, search]);

  // Leaving the storefront (for the admin): Analytics goes quiet.
  useEffect(() => stop, []);
  return null;
}

function ConsentBanner() {
  const choice = useChoice();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const ask = () => setAsked(true);
    window.addEventListener(ASK, ask);
    return () => window.removeEventListener(ASK, ask);
  }, []);

  if (choice === "unknown" || (choice !== null && !asked)) return null;
  const answer = (c: Choice) => {
    setAsked(false);
    choose(c);
  };
  return (
    <section
      aria-label="Analytics"
      className="consent fixed inset-x-3 bottom-3 z-50 max-w-md border border-taupe/50 bg-ivory p-5 shadow-[0_8px_30px_rgb(58_42_34/0.12)] sm:inset-x-auto sm:bottom-6 sm:left-6"
    >
      <p className="text-sm leading-relaxed">
        May we count visits? With your yes, Google Analytics tells us which pieces are looked at and bought. It never gets your name,
        number or address.{" "}
        <Link href="/policies/privacy" className="link">
          Privacy
        </Link>
      </p>
      {choice ? <p className="mt-2 text-xs text-espresso-soft">You said {choice === "yes" ? "yes" : "no"} before.</p> : null}
      <div className="mt-4 flex gap-3">
        <button type="button" className="btn-primary min-h-10 flex-1 px-4" onClick={() => answer("yes")}>
          Yes, that&apos;s fine
        </button>
        <button type="button" className="btn-outline min-h-10 flex-1 px-4" onClick={() => answer("no")}>
          No, thanks
        </button>
      </div>
    </section>
  );
}

/** For the footer: brings the question back, to change the answer. */
export function AnalyticsChoiceLink({ className }: { className?: string }) {
  if (!GA_ID) return null;
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(ASK))}>
      Analytics choice
    </button>
  );
}
