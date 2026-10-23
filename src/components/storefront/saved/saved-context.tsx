"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setSavedAction } from "@/app/(store)/saved/actions";

/**
 * The styles a signed-in customer has hearted, shared by every heart on the
 * page. Seeded by the server (SavedSeed); each tap goes through a server
 * action, which answers with the whole list. Signed out, a tap goes to sign in
 * and comes back.
 */

type SavedApi = {
  ids: ReadonlySet<string>;
  toggle: (productId: string) => Promise<string | null>;
  seed: (ids: string[]) => void;
};

const Ctx = createContext<SavedApi>({ ids: new Set(), toggle: async () => null, seed: () => {} });

export function useSaved(): SavedApi {
  return use(Ctx);
}

export function SavedProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  // The latest list, for deciding which way a tap goes.
  const current = useRef(ids);
  useEffect(() => {
    current.current = ids;
  }, [ids]);
  const router = useRouter();

  const toggle = useCallback<SavedApi["toggle"]>(
    async (productId) => {
      const on = !current.current.has(productId);
      // Shown at once; the server's answer settles it.
      const shown = new Set(current.current);
      if (on) shown.add(productId);
      else shown.delete(productId);
      current.current = shown;
      setIds(shown);
      const result = await setSavedAction(productId, on);
      if ("signIn" in result) {
        setIds((now) => {
          const next = new Set(now);
          next.delete(productId);
          return next;
        });
        router.push(`/account/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return null;
      }
      setIds(new Set(result.ids));
      return result.error ?? null;
    },
    [router],
  );

  const seed = useCallback((list: string[]) => setIds(new Set(list)), []);
  const value = useMemo<SavedApi>(() => ({ ids, toggle, seed }), [ids, toggle, seed]);
  return <Ctx value={value}>{children}</Ctx>;
}

/** Hands the server's list to the provider. */
export function SeedSaved({ ids }: { ids: string[] }) {
  const { seed } = useSaved();
  useEffect(() => seed(ids), [ids, seed]);
  return null;
}

/**
 * A heart for one style. `variant="card"` sits over a plate in the grid;
 * `"inline"` reads as a small button with its word, for the piece page.
 */
export function HeartButton({ productId, name, variant = "card", className = "" }: { productId: string; name: string; variant?: "card" | "inline"; className?: string }) {
  const { ids, toggle } = useSaved();
  const [error, setError] = useState<string | null>(null);
  const on = ids.has(productId);
  const label = on ? `Remove ${name} from your saved pieces` : `Save ${name}`;

  const tap = async () => {
    setError(null);
    setError(await toggle(productId));
  };

  const heart = (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform duration-200 ${on ? "scale-110" : ""}`}>
      <path
        d="M12 20.25s-7.5-4.6-7.5-10.1A4.15 4.15 0 0 1 12 7.6a4.15 4.15 0 0 1 7.5 2.55c0 5.5-7.5 10.1-7.5 10.1Z"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "inline") {
    return (
      <span className={className}>
        <button type="button" onClick={tap} aria-pressed={on} aria-label={label} className="inline-flex min-h-11 items-center gap-2 text-sm text-espresso hover:text-burgundy">
          <span className={on ? "text-burgundy" : undefined}>{heart}</span>
          {on ? "Saved" : "Save for later"}
        </button>
        {error ? (
          <span role="alert" className="block text-xs text-burgundy">
            {error}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={tap}
      aria-pressed={on}
      aria-label={error ?? label}
      title={error ?? label}
      className={`grid size-11 place-items-center rounded-full bg-[rgb(255_252_245/0.8)] backdrop-blur-sm transition-colors hover:text-burgundy ${on ? "text-burgundy" : "text-espresso"} ${className}`}
    >
      {heart}
    </button>
  );
}
