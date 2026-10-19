import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChapterCover } from "@/components/brand/chapter-cover";
import { ConciergeBand } from "@/components/brand/concierge";
import { Letter } from "@/components/brand/letter";
import { Spreads } from "@/components/brand/spreads";
import { toRoman } from "@/lib/format";
import { getChapterBySlug, listChapters, listPieces } from "@/modules/catalog/queries";

export async function generateStaticParams() {
  const chapters = await listChapters();
  return chapters.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/chapters/[slug]">): Promise<Metadata> {
  const chapter = await getChapterBySlug((await params).slug);
  if (!chapter) return { title: "Not found" };
  return {
    title: `Chapter ${toRoman(chapter.number)}, ${chapter.title}`,
    description: chapter.subtitle ?? undefined,
    alternates: { canonical: `/chapters/${chapter.slug}` },
  };
}

async function ChapterView({ slug }: { slug: string }) {
  "use cache";
  cacheLife("minutes");
  const now = new Date();

  const chapter = await getChapterBySlug(slug);
  if (!chapter) notFound();
  const pieces = await listPieces({ chapterId: chapter.id, sort: "sequence" });

  return (
    <>
      <ChapterCover chapter={chapter} now={now} showLetterLink={Boolean(chapter.letter)} />

      {chapter.letter ? (
        <div className="mt-28 md:mt-44">
          <Letter text={chapter.letter} signature={chapter.letterSignature} />
        </div>
      ) : null}

      <section id="pieces" aria-labelledby="pieces-heading" className="mx-auto mt-28 max-w-6xl scroll-mt-8 px-4 sm:px-8 md:mt-44">
        <div className="mb-16 md:mb-24">
          <p className="caption text-xl">In the order they were found</p>
          <h2 id="pieces-heading" className="mt-1 text-5xl md:text-6xl">
            {pieces.length === 1 ? "One piece" : `${pieces.length} pieces`}
          </h2>
        </div>
        <Spreads pieces={pieces} priorityCount={0} />
      </section>

      <div className="mt-32 md:mt-48">
        <ConciergeBand />
      </div>
    </>
  );
}

async function ChapterSlug({ params }: Pick<PageProps<"/chapters/[slug]">, "params">) {
  const { slug } = await params;
  return <ChapterView slug={slug} />;
}

export default function ChapterPage(props: PageProps<"/chapters/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[85vh]" aria-busy="true" />}>
      <ChapterSlug params={props.params} />
    </Suspense>
  );
}
