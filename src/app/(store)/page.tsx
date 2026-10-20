import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { ConciergeBand } from "@/components/brand/concierge";
import { LookbookContents, LookbookCover, LookbookNote, LookbookPage } from "@/components/lookbook/lookbook";
import { LookbookSkeleton } from "@/components/lookbook/skeletons";
import { getStorefront, listLookbookPieces } from "@/modules/catalog/queries";

/**
 * The home page is the lookbook: a cover spread, Krishna's note, a contents
 * page, then a page for every style. Its title and note are store settings.
 * Design notes: docs/DESIGN.md.
 */
async function Home() {
  "use cache";
  cacheLife("minutes");

  const [store, pieces] = await Promise.all([getStorefront(), listLookbookPieces()]);
  const hasNote = store.note.trim().length > 0;

  return (
    <div className="lookbook">
      <LookbookCover store={store} pieces={pieces} />
      <LookbookNote store={store} />
      <LookbookContents store={store} pieces={pieces} folio={hasNote ? "iv" : "iii"} />
      {pieces.map((p, i) => (
        <LookbookPage key={p.id} store={store} piece={p} index={i} />
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
    <Suspense fallback={<LookbookSkeleton />}>
      <Home />
    </Suspense>
  );
}
