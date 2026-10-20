import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChapterEditor, ChapterStatusPanel, CoverPanel } from "@/components/admin/chapter-editor";
import { Notice } from "@/components/admin/ui";
import { toRoman } from "@/lib/format";
import { requireAdmin } from "@/modules/auth/auth";
import { chapterFormValues, getChapterForEdit } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Edit chapter" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditChapterPage({ params, searchParams }: PageProps<"/admin/chapters/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { created, saved } = await searchParams;
  if (!UUID.test(id)) notFound();
  const chapter = await getChapterForEdit(id);
  if (!chapter) notFound();

  return (
    <div>
      <p className="text-sm text-espresso-soft">Chapter {toRoman(chapter.number)}</p>
      <h1 className="font-display text-3xl italic">{chapter.title}</h1>
      {created || saved ? (
        <div className="mt-4 max-w-3xl">
          <Notice>{created ? "Draft created. Add a cover, then publish it when it’s ready." : "Saved."}</Notice>
        </div>
      ) : null}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          <ChapterStatusPanel chapterId={chapter.id} status={chapter.status} slug={chapter.slug} hasRelease={chapter.releaseAt !== null} />
          <CoverPanel chapterId={chapter.id} url={chapter.coverImageUrl} alt={chapter.coverImageAlt ?? ""} />
        </div>
        <div className="lg:order-1">
          <ChapterEditor
            key={chapter.updatedAt.toISOString()}
            chapterId={chapter.id}
            initial={chapterFormValues(chapter)}
            suggestedNumber={chapter.number}
            locked={chapter.status === "published"}
          />
        </div>
      </div>
    </div>
  );
}
