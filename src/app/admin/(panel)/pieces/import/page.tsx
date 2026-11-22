import type { Metadata } from "next";
import { SheetImport } from "@/components/admin/sheet-import";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Import from a sheet" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/pieces", label: "Pieces" }}
        title="Import from a sheet"
        subtitle="Many pieces at once, from an Excel or Google Sheets file. They arrive as drafts: nothing shows on the site until you publish."
      />
      <SheetImport />
    </div>
  );
}
