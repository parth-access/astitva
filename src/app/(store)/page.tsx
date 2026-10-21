import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { cacheLife } from "next/cache";
import { ConciergeBand } from "@/components/brand/concierge";
import { headOf, LookbookContents, LookbookCover, LookbookNote } from "@/components/lookbook/lookbook";
import { LookbookPage } from "@/components/lookbook/lookbook-style";
import { LookbookSkeleton } from "@/components/lookbook/skeletons";
import { JsonLd } from "@/components/brand/json-ld";
import { organizationLd, websiteLd } from "@/lib/seo";
import { getConcierge, getStorefront, listLookbookPieces } from "@/modules/catalog/queries";

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStorefront();
  // The subtitle usually says what the season is; the rest says what the site is.
  const lead = store.subtitle ? `${store.subtitle} ` : "A few considered styles, each in the colours we couldn't choose between. ";
  return {
    // The brand first: this is the page people find by searching for it.
    title: { absolute: store.title ? `Astitva — ${store.title}` : "Astitva — Your true form" },
    description: `${lead}Womenswear by Astitva: turn the pages of the lookbook and shop each style.`.slice(0, 300),
    alternates: { canonical: "/" },
  };
}

/**
 * The home page is the lookbook: a cover spread, Krishna's note, a contents
 * page, then a page for every style. Its title and note are store settings.
 * Design notes: docs/DESIGN.md.
 */
async function Home() {
  "use cache";
  cacheLife("minutes");

  const [store, pieces, concierge] = await Promise.all([getStorefront(), listLookbookPieces(), getConcierge()]);
  const hasNote = store.note.trim().length > 0;

  return (
    <div className="lookbook">
      <JsonLd data={[organizationLd({ whatsapp: concierge.whatsapp, email: concierge.email }), websiteLd()]} />
      <LookbookCover store={store} pieces={pieces} />
      <LookbookNote store={store} />
      <LookbookContents store={store} pieces={pieces} folio={hasNote ? "iv" : "iii"} />
      {pieces.map((p, i) => (
        <LookbookPage key={p.id} head={headOf(store)} piece={p} index={i} />
      ))}
      {/* End matter scrolls normally and covers the last leaf. */}
      <div className="relative z-10 border-t border-sand bg-ivory pb-10 pt-24 md:pt-32">
        <ConciergeBand />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Reveal fallback={<LookbookSkeleton />}>
      <Home />
    </Reveal>
  );
}
