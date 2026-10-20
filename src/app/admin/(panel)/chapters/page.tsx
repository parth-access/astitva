import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { formatLongDate, toRoman } from "@/lib/format";
import { requireAdmin } from "@/modules/auth/auth";
import { listAdminChapters } from "@/modules/catalog-admin/queries";

export const metadata: Metadata = { title: "Chapters" };

export default async function ChaptersPage() {
  await requireAdmin();
  const list = await listAdminChapters();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl">Chapters</h1>
        <Link href="/admin/chapters/new" className="btn-primary">
          Add a chapter
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="mt-10 text-espresso-soft">No chapters yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-sand border-y border-sand">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/chapters/${c.id}`}
                className="grid grid-cols-[4rem_1fr_auto] items-center gap-4 py-4 hover:bg-champagne"
              >
                <span className="font-display text-lg text-espresso-soft">{toRoman(c.number)}</span>
                <span>
                  <span className="font-display italic">{c.title}</span>
                  <span className="block text-sm text-espresso-soft">
                    {c.pieceCount} {c.pieceCount === 1 ? "piece" : "pieces"} on the site
                    {c.releaseAt ? ` · opens ${formatLongDate(c.releaseAt)}` : " · no release date"}
                  </span>
                </span>
                <StatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
