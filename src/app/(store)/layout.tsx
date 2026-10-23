import { Suspense } from "react";
import { Intro } from "@/components/brand/intro";
import { BagProvider } from "@/components/storefront/bag/bag-context";
import { BagDrawer } from "@/components/storefront/bag/bag-drawer";
import { BagSeed } from "@/components/storefront/bag/bag-seed";
import { SavedProvider } from "@/components/storefront/saved/saved-context";
import { SavedSeed } from "@/components/storefront/saved/saved-seed";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getStorefront } from "@/modules/catalog/queries";
import { getCheckoutSettings } from "@/modules/checkout/queries";

/** While ordering is closed (store settings), every page says so at the top. */
const PREVIEW_NOTICE = "Preview. Ordering opens soon.";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const [{ orderingOpen }, pricing] = await Promise.all([getStorefront(), getCheckoutSettings()]);
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
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <BagDrawer />
        {/* The bag depends on the visitor's cookie, so it streams in after the page. */}
        <Suspense fallback={null}>
          <BagSeed enabled={orderingOpen} />
        </Suspense>
        {/* So are the hearts, which depend on the session. */}
        <Suspense fallback={null}>
          <SavedSeed />
        </Suspense>
      </SavedProvider>
    </BagProvider>
  );
}
