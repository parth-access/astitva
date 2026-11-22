import type { Metadata } from "next";
import { FolderPhotos } from "@/components/admin/folder-photos";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Add photos from folders" };

export default async function FolderPhotosPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/pieces", label: "Pieces" }}
        title="Add photos from folders"
        subtitle="Photos for many pieces at once, each into its piece and colour by the folder it's in."
      />
      <FolderPhotos />
    </div>
  );
}
