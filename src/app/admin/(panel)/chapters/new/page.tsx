import type { Metadata } from "next";
import { ChapterEditor } from "@/components/admin/chapter-editor";
import { requireAdmin } from "@/modules/auth/auth";
import { getNextChapterNumber } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Add a chapter" };

export default async function NewChapterPage() {
  await requireAdmin();
  const suggestedNumber = await getNextChapterNumber();
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl">Add a chapter</h1>
      <p className="mt-2 text-sm text-espresso-soft">It starts as a draft. Add the cover photo after creating it.</p>
      <div className="mt-8">
        <ChapterEditor chapterId={null} initial={{}} suggestedNumber={suggestedNumber} locked={false} />
      </div>
    </div>
  );
}
