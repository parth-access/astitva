import type { Metadata } from "next";
import { PieceEditor } from "@/components/admin/piece-editor";
import { requireAdmin } from "@/modules/auth/auth";
import { getEditorOptions } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Add a piece" };

export default async function NewPiecePage() {
  await requireAdmin();
  const options = await getEditorOptions();
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl">Add a piece</h1>
      <p className="mt-2 text-sm text-espresso-soft">It starts as a draft. Nothing shows on the site until you publish it. Add photos after creating the draft.</p>
      <div className="mt-8">
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
