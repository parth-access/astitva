import Link from "next/link";
import { formatLongDate, toRoman } from "@/lib/format";
import type { Chapter } from "@/modules/catalog/queries";
import { HatMark } from "./hat-mark";
import { Plate } from "./plate";

function releaseLine(releaseAt: Date | null, now: Date) {
  if (!releaseAt) return null;
  return { label: releaseAt > now ? "Opens" : "Opened", date: formatLongDate(releaseAt) };
}

/**
 * The cover of a chapter, like the cover of a printed lookbook. On first load
 * the arch rises open and the type settles beneath it: the page's one moment
 * of motion.
 */
export function ChapterCover({
  chapter,
  now,
  headingLevel = "h1",
  showLetterLink = true,
}: {
  chapter: Chapter;
  now: Date;
  headingLevel?: "h1" | "h2";
  showLetterLink?: boolean;
}) {
  const Heading = headingLevel;
  const release = releaseLine(chapter.releaseAt, now);
  return (
    <section className="mx-auto grid max-w-6xl items-end gap-10 px-4 pt-8 sm:px-8 md:grid-cols-12 md:gap-8 md:pt-14">
      <div className="mx-auto w-[78%] max-w-sm md:order-2 md:col-span-6 md:col-start-7 md:w-full md:max-w-none">
        <div className="cover-rise">
          <Plate
            src={chapter.coverImageUrl}
            alt={chapter.coverImageAlt ?? `Chapter ${toRoman(chapter.number)}, ${chapter.title}`}
            tone={chapter.tone}
            ratio="3/4"
            sizes="(min-width: 768px) 46vw, 78vw"
            priority
            emblem={<HatMark className="h-auto w-full" />}
          />
        </div>
      </div>

      <div className="md:order-1 md:col-span-6 md:pb-10">
        <p className="cover-settle caption text-2xl" style={{ ["--delay" as string]: "450ms" }}>
          Chapter {toRoman(chapter.number)}
        </p>
        <Heading className="cover-settle mt-2 text-6xl italic leading-none md:text-8xl" style={{ ["--delay" as string]: "600ms" }}>
          {chapter.title}
        </Heading>
        {chapter.subtitle ? (
          <p className="cover-settle mt-6 max-w-md text-lg leading-relaxed" style={{ ["--delay" as string]: "750ms" }}>
            {chapter.subtitle}
          </p>
        ) : null}
        <div className="cover-settle mt-10" style={{ ["--delay" as string]: "900ms" }}>
          <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-espresso-soft">Pieces</dt>
            <dd className="tabular-nums">{chapter.pieceCount}</dd>
            {release ? (
              <>
                <dt className="text-espresso-soft">{release.label}</dt>
                <dd>{release.date}</dd>
              </>
            ) : null}
          </dl>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            <Link href={`/chapters/${chapter.slug}#pieces`} className="btn-primary">
              See the pieces
            </Link>
            {showLetterLink ? (
              <Link href={`/chapters/${chapter.slug}#letter`} className="link self-center text-sm">
                Read the letter
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
