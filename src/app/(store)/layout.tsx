import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";

// TODO(launch): remove the notice once checkout (M3) is live.
const PREVIEW_NOTICE = "Preview. Ordering opens with Chapter I.";

export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ivory focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader notice={PREVIEW_NOTICE} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
