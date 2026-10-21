import { Suspense, ViewTransition, type ReactNode } from "react";

/** A loading boundary whose skeleton sinks away as the content rises into place. */
export function Reveal({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="skeleton-out" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="content-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}
