import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { formatPieceNumber, toRoman } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { listAdminPieces, type AdminPieceRow } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Pieces" };

function stockLabel(p: AdminPieceRow) {
  if (p.onHand > 0) return `${p.onHand} in stock`;
  return p.sold > 0 ? "Found its home" : "None in stock";
}

export default async function PiecesPage() {
  await requireAdmin();
  const pieces = await listAdminPieces();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl">Pieces</h1>
        <Link href="/admin/pieces/new" className="btn-primary">
          Add a piece
        </Link>
      </div>

      {pieces.length === 0 ? (
        <p className="mt-10 text-espresso-soft">No pieces yet. Add the first one.</p>
      ) : (
        <ul className="mt-8 divide-y divide-sand border-y border-sand">
          {pieces.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/pieces/${p.id}`}
                className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-1 py-4 hover:bg-champagne sm:grid-cols-[3.5rem_1fr_7rem_8rem_6rem] sm:items-center"
              >
                <span className="row-span-2 font-display text-lg text-espresso-soft sm:row-span-1">
                  {p.pieceNumber ? formatPieceNumber(p.pieceNumber) : "—"}
                </span>
                <span>
                  <span className="font-display italic">{p.pieceName ?? "Unnamed"}</span>
                  <span className="block text-sm text-espresso-soft">
                    {p.name}
                    {p.chapterNumber ? ` · Chapter ${toRoman(p.chapterNumber)}` : ""}
                  </span>
                </span>
                <span className="text-sm sm:text-right">{p.priceMinor === null ? "No price" : formatINR(p.priceMinor)}</span>
                <span className="text-sm text-espresso-soft sm:text-right">{stockLabel(p)}</span>
                <span className="sm:text-right">
                  <StatusBadge status={p.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
