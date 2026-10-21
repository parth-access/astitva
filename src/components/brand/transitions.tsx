import { ViewTransition, type ReactNode } from "react";

/**
 * How moving between pages looks. A link says which way it goes with
 * `transitionTypes` (src/lib/transition-types.ts); anything else (the
 * browser's back button, a refresh after saving) swaps without motion.
 * Animations live in globals.css; reduced motion turns them all off.
 */
const byType = { "nav-forward": "nav-forward", "nav-back": "nav-back", "nav-across": "nav-across", default: "none" };

/**
 * Wraps a page so it enters and the last one leaves. Used by the
 * `template.tsx` files (which remount on every navigation between sections)
 * and inside pages whose own address changes, like one piece to the next.
 * Only the outermost one that mounts animates.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={byType} exit={byType} default="none">
      {children}
    </ViewTransition>
  );
}
