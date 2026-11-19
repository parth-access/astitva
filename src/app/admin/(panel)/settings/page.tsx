import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { Notice, PageHeader } from "@/components/admin/ui";
import { db } from "@/db/client";
import { paiseToRupeesText } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { formatPieceNumber } from "@/lib/format";
import { publishedPieces, settingsRow } from "@/modules/catalog-admin/settings";
import { CONTENTS_PLACES } from "@/modules/catalog/contents";
import { ABOUT_DEFAULT } from "@/content/about";

export const metadata: Metadata = { title: "Lookbook & settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin({ roles: ["owner"] });
  const { saved } = await searchParams;
  const [s, pieces] = await Promise.all([settingsRow(db), publishedPieces(db)]);
  const initial: Record<string, string> = {
    lookbookTitle: s?.lookbookTitle ?? "",
    lookbookSubtitle: s?.lookbookSubtitle ?? "",
    note: s?.note ?? "",
    noteSignature: s?.noteSignature ?? "",
    // Until she saves her own, the box starts with the words the page shows.
    aboutIntro: s?.aboutBody ? (s.aboutIntro ?? "") : (s?.aboutIntro ?? ABOUT_DEFAULT.intro),
    aboutBody: s?.aboutBody || ABOUT_DEFAULT.body,
    orderingOpen: s?.orderingOpen ? "on" : "",
    supportWhatsapp: s?.supportWhatsapp ?? "",
    conciergeName: s?.conciergeName ?? "",
    supportEmail: s?.supportEmail ?? "",
    profileLinks: (s?.profileLinks ?? []).join("\n"),
    shippingFlatMinor: paiseToRupeesText(Number(s?.shippingFlatMinor ?? 0)),
    freeShippingThresholdMinor: s?.freeShippingThresholdMinor == null ? "" : paiseToRupeesText(Number(s.freeShippingThresholdMinor)),
    ...Object.fromEntries(Array.from({ length: CONTENTS_PLACES }, (_, i) => [`contentsPick${i}`, s?.contentsPicks[i] ?? ""])),
  };
  const choices = pieces.map((p) => ({
    id: p.id,
    label: [p.pieceNumber ? formatPieceNumber(p.pieceNumber) : null, p.pieceName ? `${p.pieceName}, ${p.name.toLowerCase()}` : p.name].filter(Boolean).join(" "),
  }));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Lookbook & settings" subtitle="The home page's words, ordering, delivery charges and how buyers reach you." />
      {saved ? (
        <div className="-mt-4 mb-6">
          <Notice>Saved. The site shows it now.</Notice>
        </div>
      ) : null}
      <div>
        <SettingsForm initial={initial} pieces={choices} />
      </div>
    </div>
  );
}
