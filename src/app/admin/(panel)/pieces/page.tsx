import type { Metadata } from "next";
import Link from "next/link";
import { Chip, EmptyState, PageHeader, StatusBadge, cardClass } from "@/components/admin/ui";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { formatPieceNumber } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { normaliseTone } from "@/lib/tone";
import { FORWARD } from "@/lib/transition-types";
import { requireAdmin } from "@/modules/auth/auth";
import { listAdminPieces, type AdminPieceRow } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Pieces" };

function Swatches({ colours }: { colours: AdminPieceRow["colours"] }) {
  const named = colours.filter((c) => c.name);
  if (named.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-label={named.map((c) => c.name).join(", ")}>
      {named.map((c) => (
        <span key={c.name} title={c.name ?? ""} className="inline-block size-3.5 rounded-full ring-1 ring-taupe/60" style={{ backgroundColor: c.hex ?? "#d9c7ad" }} />
      ))}
    </span>
  );
}

function Stock({ p }: { p: AdminPieceRow }) {
  if (p.onHand === 0) return <Chip tone="attention">Sold out</Chip>;
  if (p.low > 0) return <Chip tone="warning">{p.onHand} in stock · {p.low} low</Chip>;
  return <Chip tone="quiet">{p.onHand} in stock</Chip>;
}

export default async function PiecesPage() {
  await requireAdmin();
  const pieces = await listAdminPieces();

  return (
    <div>
      <PageHeader
        title="Pieces"
        subtitle={`${pieces.length} ${pieces.length === 1 ? "piece" : "pieces"}, in house order.`}
        actions={
          <Link href="/admin/pieces/new" transitionTypes={FORWARD} className="btn-primary">
            Add a piece
          </Link>
        }
      />

      {pieces.length === 0 ? (
        <EmptyState title="No pieces yet">Add the first one: its name, colours and sizes, then photos.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pieces.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/pieces/${p.id}`} transitionTypes={FORWARD} className={`${cardClass} group flex h-full gap-4 p-3 transition-transform hover:-translate-y-0.5 hover:border-taupe`}>
                <span className="relative block w-20 shrink-0 overflow-hidden rounded-lg sm:w-24" style={{ aspectRatio: "4/5", backgroundColor: normaliseTone(p.tone) }}>
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, sized by Cloudinary
                    <img src={cloudinaryUrl(p.cover, { width: 200, height: 250 })} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-full place-items-center px-1 text-center font-display text-sm italic text-ivory/90 mix-blend-luminosity">{p.pieceName ?? "—"}</span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col py-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-xs tabular-nums text-espresso-soft">{p.pieceNumber ? formatPieceNumber(p.pieceNumber) : "No number yet"}</span>
                      <span className="block truncate font-display text-lg italic leading-snug group-hover:text-burgundy">{p.pieceName ?? "Unnamed"}</span>
                    </span>
                    <StatusBadge status={p.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-espresso-soft">
                    {p.name}
                    {p.sizes > 1 ? ` · ${p.sizes} sizes` : ""}
                  </span>
                  <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                    <Swatches colours={p.colours} />
                    <span className="text-sm tabular-nums">{p.priceMinor === null ? "No price" : formatINR(p.priceMinor)}</span>
                  </span>
                  <span className="mt-2">
                    <Stock p={p} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
