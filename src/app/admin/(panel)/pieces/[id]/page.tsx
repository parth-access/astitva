import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PieceEditor } from "@/components/admin/piece-editor";
import { StatusPanel, StockPanel } from "@/components/admin/piece-panels";
import { Notice } from "@/components/admin/ui";
import { formatPieceNumber } from "@/lib/format";
import { requireAdmin } from "@/modules/auth/auth";
import { getEditorOptions, getPieceForEdit, getPublishProblems, pieceFormValues } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Edit piece" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPiecePage({ params, searchParams }: PageProps<"/admin/pieces/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { created, saved } = await searchParams;
  if (!UUID.test(id)) notFound();
  const [piece, options, problems] = await Promise.all([getPieceForEdit(id), getEditorOptions(), getPublishProblems(id)]);
  if (!piece) notFound();
  const { product, variants } = piece;

  return (
    <div>
      <p className="text-sm text-espresso-soft">{product.pieceNumber ? formatPieceNumber(product.pieceNumber) : "No number yet"}</p>
      <h1 className="font-display text-3xl">
        <span className="italic">{product.pieceName ?? "Unnamed"}</span>
        <span className="block text-lg text-espresso-soft">{product.name}</span>
      </h1>
      {created || saved ? (
        <div className="mt-4 max-w-3xl">
          <Notice>{created ? "Draft created. Publish it when it’s ready." : "Saved."}</Notice>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          <StatusPanel productId={product.id} status={product.status} slug={product.slug} problems={problems} />
          <StockPanel
            productId={product.id}
            variants={variants
              .filter((v) => v.isActive)
              .map((v) => ({ id: v.id, label: v.size ? `Size ${v.size}` : "One size", onHand: v.onHand }))}
          />
        </div>
        <div className="lg:order-1">
          <PieceEditor
            key={product.updatedAt.toISOString()}
            productId={product.id}
            initial={pieceFormValues(piece)}
            rows={variants.map((v, index) => ({ index, id: v.id, sku: v.sku, onHand: v.onHand }))}
            options={options}
            locked={product.publishedAt !== null}
          />
        </div>
      </div>
    </div>
  );
}
