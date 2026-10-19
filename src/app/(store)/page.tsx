import Link from "next/link";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { ArchiveGrid } from "@/components/brand/archive-strip";
import { ChapterCover } from "@/components/brand/chapter-cover";
import { ConciergeBand } from "@/components/brand/concierge";
import { Letter } from "@/components/brand/letter";
import { Spreads } from "@/components/brand/spreads";
import { toRoman } from "@/lib/format";
import { getCurrentChapter, listArchive, listPieces } from "@/modules/catalog/queries";

const SPREAD_LIMIT = 6;

async function Home() {
  "use cache";
  cacheLife("minutes");
  const now = new Date();

  const chapter = await getCurrentChapter();
  const [pieces, archive] = await Promise.all([
    listPieces({ chapterId: chapter?.id, sort: "sequence" }),
    listArchive(4),
  ]);
  // Sold pieces live in the archive section, so each piece appears once on the page.
  const available = pieces.filter((p) => p.onHand > 0);
  const shown = available.slice(0, SPREAD_LIMIT);

  return (
    <>
      <div id="chapter" className="scroll-mt-4">
        {chapter ? (
          <ChapterCover chapter={chapter} now={now} />
        ) : (
          <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
            <h1 className="text-6xl italic md:text-8xl">Your true form</h1>
          </section>
        )}
      </div>

      {chapter?.letter ? (
        <div className="mt-28 md:mt-44">
          <Letter text={chapter.letter} signature={chapter.letterSignature} excerpt={2} href={`/chapters/${chapter.slug}#letter`} id="letter-excerpt" />
        </div>
      ) : null}

      <section id="pieces" aria-labelledby="pieces-heading" className="mx-auto mt-28 max-w-6xl scroll-mt-8 px-4 sm:px-8 md:mt-44">
        <div className="mb-16 flex flex-wrap items-end justify-between gap-6 md:mb-24">
          <div>
            {chapter ? <p className="caption text-xl">Chapter {toRoman(chapter.number)}, {chapter.title}</p> : null}
            <h2 id="pieces-heading" className="mt-1 text-5xl md:text-6xl">
              The pieces
            </h2>
          </div>
          {chapter && pieces.length > shown.length ? (
            <Link href={`/chapters/${chapter.slug}#pieces`} className="link text-sm">
              All {pieces.length} pieces of Chapter {toRoman(chapter.number)}
            </Link>
          ) : null}
        </div>
        {shown.length > 0 ? (
          <Spreads pieces={shown} priorityCount={0} />
        ) : (
          <p className="caption text-2xl">Every piece in this chapter has found its home. The next chapter is being gathered.</p>
        )}
      </section>

      <div className="mt-32 md:mt-48">
        <ConciergeBand />
      </div>

      {archive.length > 0 ? (
        <section aria-labelledby="archive-heading" className="mx-auto mt-28 max-w-6xl px-4 sm:px-8 md:mt-40">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="caption text-xl">They do not come back</p>
              <h2 id="archive-heading" className="mt-1 text-5xl">
                Found their home
              </h2>
            </div>
            <Link href="/archive" className="link text-sm">
              The archive
            </Link>
          </div>
          <ArchiveGrid pieces={archive} />
        </section>
      ) : null}
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-[85vh]" aria-busy="true" />}>
      <Home />
    </Suspense>
  );
}
