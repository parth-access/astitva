import { Intro } from "@/components/brand/intro";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getStorefront } from "@/modules/catalog/queries";

/** While ordering is closed (store settings), every page says so at the top. */
const PREVIEW_NOTICE = "Preview. Ordering opens soon.";


export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const { orderingOpen } = await getStorefront();
  return (
    <>
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
    </>
  );
}
