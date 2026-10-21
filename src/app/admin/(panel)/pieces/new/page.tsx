import type { Metadata } from "next";
import { PieceEditor } from "@/components/admin/piece-editor";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/modules/auth/auth";
import { getEditorOptions } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Add a piece" };

export default async function NewPiecePage() {
  await requireAdmin();
  const options = await getEditorOptions();
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/pieces", label: "Pieces" }}
        title="Add a piece"
        subtitle="It starts as a draft. Nothing shows on the site until you publish it. Add photos after creating the draft."
      />
      <div>
        <PieceEditor
          productId={null}
          initial={{}}
          options={options}
          locked={false}
        />
      </div>
    </div>
  );
}
