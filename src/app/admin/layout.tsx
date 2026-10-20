import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Astitva admin" },
  robots: { index: false, follow: false },
};

/** Every admin page reads the session, so it renders per request behind this boundary. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col bg-ivory text-espresso">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
