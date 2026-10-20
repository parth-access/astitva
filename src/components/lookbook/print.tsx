import type { ReactNode } from "react";

/** Print furniture for the lookbook pages: folios and running heads. */

/** Lowercase Roman folios for the front matter, Arabic for the plates. */
export function Folio({ children, side, wideOnly = false }: { children: ReactNode; side: "left" | "right"; wideOnly?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`folio absolute bottom-5 ${side === "left" ? "left-5 sm:left-8" : "right-5 sm:right-8"} ${wideOnly ? "hidden md:inline" : ""}`}
    >
      {children}
    </span>
  );
}

export function RunningHead({ children, side = "right", wideOnly = false }: { children: ReactNode; side?: "left" | "right"; wideOnly?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`folio absolute top-5 ${side === "left" ? "left-5 sm:left-8" : "right-5 sm:right-8"} ${wideOnly ? "hidden md:inline" : ""}`}
    >
      {children}
    </span>
  );
}
