import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveGrid } from "@/components/brand/archive-strip";
import { listArchive } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "The archive",
  description: "Astitva pieces that have found their home. Each one existed once.",
};

export default async function ArchivePage() {
  const pieces = await listArchive(500);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-8 md:pt-20">
      <div className="max-w-2xl">
        <p className="caption text-xl">They do not come back</p>
        <h1 className="mt-1 text-6xl italic md:text-7xl">Found their home</h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed">
          Every piece Astitva has sold stays here, with its number and name. Most of them existed only once, so this is the
          only place you will see them again.
        </p>
      </div>
      <div className="mt-16 md:mt-24">
        {pieces.length > 0 ? (
          <ArchiveGrid pieces={pieces} />
        ) : (
          <p className="caption text-2xl">
            Nothing has gone home yet. Every piece is still <Link href="/shop" className="link">waiting to be found</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
