"use client";

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";

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

  // Arriving with ?colour=… (from the lookbook or a shared link).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("colour");
    const match = wanted ? colours.find((c) => c.name?.toLowerCase() === wanted.toLowerCase()) : undefined;
    // Reads the address once on arrival; there is no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setColourState(match.name);
  }, [colours]);

  const value = useMemo<Selection>(
    () => ({
      colours,
      colour,
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
    [colours, colour, size],
  );

  return <Ctx value={value}>{children}</Ctx>;
}
