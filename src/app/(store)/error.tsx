"use client";

import { ErrorView } from "@/components/brand/error-view";

/** A store page broke: the header and footer stay, so the rest of the shop is a click away. */
export default function StoreError(props: { error: unknown; retry: () => void }) {
  return <ErrorView {...props} />;
}
