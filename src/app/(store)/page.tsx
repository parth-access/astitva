import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { ArchiveGrid } from "@/components/brand/archive-strip";
import { ConciergeBand } from "@/components/brand/concierge";
import { LookbookContents, LookbookCover, LookbookPage } from "@/components/lookbook/lookbook";
import { getCurrentChapter, listArchive, listLookbookPieces } from "@/modules/catalog/queries";

/**
 * The home page is the current chapter as a printed lookbook: a cover spread,
 * a contents page, then a page for every piece (sold ones stay, marked).
 * Design notes: docs/DESIGN.md.
 */
async function Home() {
  "use cache";
  cacheLife("minutes");
  const now = new Date();

  const chapter = await getCurrentChapter();
  if (!chapter) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-8">
        <h1 className="lookbook-title italic leading-[0.85]">Your true form</h1>
        <p className="caption mt-8 text-2xl">The first chapter is being gathered.</p>
      </section>
    );
  }

  const [pieces, archive] = await Promise.all([listLookbookPieces(chapter.id), listArchive(12)]);
  // This chapter's sold pieces already have their page above; the archive here is for earlier chapters.
  const inBook = new Set(pieces.map((p) => p.id));
  const earlier = archive.filter((p) => !inBook.has(p.id)).slice(0, 4);

  return (
    <div className="lookbook">
      <LookbookCover chapter={chapter} pieces={pieces} now={now} />
      <LookbookContents chapter={chapter} pieces={pieces} />
      {pieces.map((p, i) => (
        <LookbookPage key={p.id} chapter={chapter} piece={p} index={i} />
      ))}
      {/* End matter scrolls normally and covers the last leaf. */}
      <div className="relative z-10 border-t border-sand bg-ivory pb-10 pt-24 md:pt-32">
        <ConciergeBand />
        {earlier.length > 0 ? (
          <section aria-labelledby="archive-heading" className="mx-auto mt-24 max-w-6xl px-4 sm:px-8 md:mt-32">
            <p className="caption text-xl">From earlier chapters</p>
            <h2 id="archive-heading" className="mb-12 mt-1 text-5xl">
              Found their home
            </h2>
            <ArchiveGrid pieces={earlier} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-[85vh]" aria-busy="true" />}>
      <Home />
    </Suspense>
  );
}
