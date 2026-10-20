"use client";

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

/**
 * The colour (and size) chosen on a piece page, shared by the gallery on the
 * left and the options on the right. The colour is mirrored in the address
 * (?colour=Sage) so a shared link opens on it, without a navigation.
 */

export type SelectionColour = { name: string | null; hex: string | null };

type Selection = {
  colours: SelectionColour[];
  colour: string | null;
  setColour: (name: string | null) => void;
  size: string | null;
  setSize: (size: string | null) => void;
  /** Take the colour named in the address (once, after hydration). */
  adoptAddressColour: () => void;
};

const Ctx = createContext<Selection | null>(null);

export function useSelection(): Selection {
  const s = use(Ctx);
  if (!s) throw new Error("useSelection needs a PieceSelection around it");
  return s;
}

export function PieceSelection({
  colours,
  initialColour,
  children,
}: {
  colours: SelectionColour[];
  initialColour: string | null;
  children: ReactNode;
}) {
  const [colour, setColourState] = useState(initialColour);
  const [size, setSize] = useState<string | null>(null);

  /**
   * Arriving with ?colour=… (from the lookbook or a shared link). Called by the
   * buy panel once it has hydrated: it streams in after the rest of the page
   * with HTML for the default colour, so changing the colour any earlier would
   * make its HTML disagree with the browser's first render.
   */
  const adoptAddressColour = useCallback(() => {
    const wanted = new URLSearchParams(window.location.search).get("colour");
    const match = wanted ? colours.find((c) => c.name?.toLowerCase() === wanted.toLowerCase()) : undefined;
    if (match) setColourState(match.name);
  }, [colours]);

  const value = useMemo<Selection>(
    () => ({
      colours,
      colour,
      adoptAddressColour,
      setColour(name) {
        setColourState(name);
        const url = new URL(window.location.href);
        if (name) url.searchParams.set("colour", name);
        else url.searchParams.delete("colour");
        window.history.replaceState(window.history.state, "", url);
      },
      size,
      setSize,
    }),
    [colours, colour, size, adoptAddressColour],
  );

  return <Ctx value={value}>{children}</Ctx>;
}
