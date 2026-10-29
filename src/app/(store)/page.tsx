import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { cacheLife } from "next/cache";
import { ConciergeBand } from "@/components/brand/concierge";
import { LookbookContents, LookbookCover, LookbookNote } from "@/components/lookbook/lookbook";
import { HomeCategories, HomePieces } from "@/components/lookbook/home-sections";
import { LookbookSkeleton } from "@/components/lookbook/skeletons";
import { JsonLd } from "@/components/brand/json-ld";
import { organizationLd, pageMeta, websiteLd } from "@/lib/seo";
import { chooseContents } from "@/modules/catalog/contents";
import { getConcierge, getStorefront, listCategories, listLookbookPieces, listPieces } from "@/modules/catalog/queries";

export async function generateMetadata(): Promise<Metadata> {
  const [store, categories] = await Promise.all([getStorefront(), listCategories()]);
  // The subtitle usually says what the season is; the rest says what the site is.
  const lead = store.subtitle ? `${store.subtitle} ` : "A few considered styles, each in the colours we couldn't choose between. ";
  const kinds = categories.filter((c) => c.styles > 0).map((c) => c.name.toLowerCase());
  const sells = kinds.length ? `Shop ${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}` : kinds[0]} online, delivered across India.` : "Shop online, delivered across India.";
  return pageMeta({
    // The brand first, then what it sells: this is the page people find by searching for it.
    absoluteTitle: `Astitva — Women's clothing online | ${store.title ?? "Your true form"}`,
    description: `${lead}Womenswear by Astitva. ${sells}`.slice(0, 300),
    path: "/",
  });
}

/**
 * The home page opens as the lookbook (a cover spread, Krishna's note, a
 * contents page of three pieces), then turns into the shop: every piece at
 * once, then the categories. Its title, note and the three pieces are store
 * settings; a place left empty gets a random piece, drawn again each time
 * this cached page is rebuilt (every few minutes).
 * Design notes: docs/DESIGN.md.
 */
async function Home() {
  "use cache";
  cacheLife("minutes");

  const [store, pieces, cards, categories, concierge] = await Promise.all([getStorefront(), listLookbookPieces(), listPieces(), listCategories(), getConcierge()]);
  const hasNote = store.note.trim().length > 0;

  return (
    <div className="lookbook">
      <JsonLd data={[organizationLd({ whatsapp: concierge.whatsapp, email: concierge.email, profiles: concierge.profileLinks }), websiteLd()]} />
      <LookbookCover store={store} pieces={pieces} />
      <LookbookNote store={store} />
      <LookbookContents store={store} pieces={chooseContents(pieces, store.contentsPicks)} total={pieces.length} folio={hasNote ? "iv" : "iii"} />
      {/* The shop scrolls normally and covers the last leaf. */}
      <HomePieces pieces={cards} />
      <HomeCategories categories={categories} pieces={cards} />
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
