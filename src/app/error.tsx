"use client";

import { ErrorView } from "@/components/brand/error-view";

/** Anything under the root layout, including the store's own layout failing. */
export default function Error(props: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 flex-col">
      <ErrorView {...props} />
    </main>
  );
}
