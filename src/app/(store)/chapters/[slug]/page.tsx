import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConciergeBand } from "@/components/brand/concierge";
import { LookbookContents, LookbookCover, LookbookLetter, LookbookPage } from "@/components/lookbook/lookbook";
import { toRoman } from "@/lib/format";
import { getChapterBySlug, listChapters, listLookbookPieces } from "@/modules/catalog/queries";

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

/** A chapter in full: the same lookbook as the home page, with the whole letter. */
async function ChapterView({ slug }: { slug: string }) {
  "use cache";
  cacheLife("minutes");
  const now = new Date();

  const chapter = await getChapterBySlug(slug);
  if (!chapter) notFound();
  const pieces = await listLookbookPieces(chapter.id);

  return (
    <div className="lookbook">
      <LookbookCover chapter={chapter} pieces={pieces} now={now} />
      <LookbookLetter chapter={chapter} />
      <LookbookContents chapter={chapter} pieces={pieces} folio={chapter.letter ? "iv" : "iii"} />
      {pieces.map((p, i) => (
        <LookbookPage key={p.id} chapter={chapter} piece={p} index={i} />
      ))}
      <div className="relative z-10 border-t border-sand bg-ivory pb-10 pt-24 md:pt-32">
        <ConciergeBand />
      </div>
    </div>
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
