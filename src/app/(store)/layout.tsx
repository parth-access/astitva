import { Suspense } from "react";
import { Intro } from "@/components/brand/intro";
import { Analytics } from "@/components/storefront/analytics";
import { BagProvider } from "@/components/storefront/bag/bag-context";
import { BagDrawer } from "@/components/storefront/bag/bag-drawer";
import { SavedProvider } from "@/components/storefront/saved/saved-context";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { VisitorSeed } from "@/components/storefront/visitor-seed";
import { getConcierge, getStorefront } from "@/modules/catalog/queries";
import { getCheckoutSettings } from "@/modules/checkout/queries";

/** While ordering is closed (store settings), every page says so at the top. */
const PREVIEW_NOTICE = "Preview. Ordering opens soon.";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const [{ orderingOpen }, pricing, { profileLinks }] = await Promise.all([getStorefront(), getCheckoutSettings(), getConcierge()]);
  return (
    <BagProvider enabled={orderingOpen} pricing={pricing}>
      <SavedProvider>
        <Intro />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ivory focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader notice={orderingOpen ? null : PREVIEW_NOTICE} />
        {/* Before the page, so a new page's view is counted before anything it sends. */}
        <Analytics />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter profiles={profileLinks} />
        <BagDrawer />
        {/* The bag and hearts depend on the visitor's cookies, so the browser asks for them after the page. */}
        <Suspense fallback={null}>
          <VisitorSeed />
        </Suspense>
      </SavedProvider>
    </BagProvider>
  );
}
