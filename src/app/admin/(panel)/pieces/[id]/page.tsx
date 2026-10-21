import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PieceEditor } from "@/components/admin/piece-editor";
import { StatusPanel } from "@/components/admin/piece-panels";
import { PhotosPanel } from "@/components/admin/photos-panel";
import { SpinPanel } from "@/components/admin/spin-panel";
import { Notice } from "@/components/admin/ui";
import { formatPieceNumber } from "@/lib/format";
import { db } from "@/db/client";
import { waitingByVariant } from "@/modules/alerts/service";
import { requireAdmin } from "@/modules/auth/auth";
import { getEditorOptions, getPieceForEdit, getPublishProblems, pieceFormValues, pieceGrid } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Edit piece" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPiecePage({ params, searchParams }: PageProps<"/admin/pieces/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { created, saved } = await searchParams;
  if (!UUID.test(id)) notFound();
  const [piece, options, problems] = await Promise.all([getPieceForEdit(id), getEditorOptions(), getPublishProblems(id)]);
  if (!piece) notFound();
  const { product, photos } = piece;
  const { colours } = pieceGrid(piece);
  const waiting = await waitingByVariant(db, piece.variants.map((v) => v.id));
  const waitingList = piece.variants
    .filter((v) => (waiting.get(v.id) ?? 0) > 0)
    .map((v) => `${waiting.get(v.id)} for ${[v.color, v.size].filter(Boolean).join(" ") || "it"}`);

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

      {waitingList.length ? (
        <div className="mt-4 max-w-3xl">
          <Notice>
            Waiting to hear it&apos;s back: {waitingList.join(", ")}. Add stock and they&apos;re emailed automatically.
          </Notice>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-6 lg:order-2">
          <StatusPanel productId={product.id} status={product.status} slug={product.slug} problems={problems} />
        </div>
        <div className="space-y-10 lg:order-1">
          <PhotosPanel
            productId={product.id}
            photos={photos}
            pieceLabel={product.pieceName ?? product.name}
            colours={colours.flatMap((c) => (c.name ? [c.name] : []))}
          />
          <SpinPanel productId={product.id} video={product.spinVideoUrl} pieceLabel={product.pieceName ?? product.name} tone={product.tone} />
          <PieceEditor
            key={product.updatedAt.toISOString()}
            productId={product.id}
            initial={pieceFormValues(piece)}
            options={options}
            locked={product.publishedAt !== null}
          />
        </div>
      </div>
    </div>
  );
}
