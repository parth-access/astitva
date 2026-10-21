import type { ReactNode } from "react";
import { PageTransition } from "@/components/brand/transitions";

/** Remounts on every navigation, so each page slides in the way its link points. */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
