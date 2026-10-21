import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { Notice, PageHeader } from "@/components/admin/ui";
import { db } from "@/db/client";
import { paiseToRupeesText } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { settingsRow } from "@/modules/catalog-admin/settings";

export const metadata: Metadata = { title: "Lookbook & settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin({ roles: ["owner"] });
  const { saved } = await searchParams;
  const s = await settingsRow(db);
  const initial: Record<string, string> = {
    lookbookTitle: s?.lookbookTitle ?? "",
    lookbookSubtitle: s?.lookbookSubtitle ?? "",
    note: s?.note ?? "",
    noteSignature: s?.noteSignature ?? "",
    orderingOpen: s?.orderingOpen ? "on" : "",
    supportWhatsapp: s?.supportWhatsapp ?? "",
    conciergeName: s?.conciergeName ?? "",
    supportEmail: s?.supportEmail ?? "",
    shippingFlatMinor: paiseToRupeesText(Number(s?.shippingFlatMinor ?? 0)),
    freeShippingThresholdMinor: s?.freeShippingThresholdMinor == null ? "" : paiseToRupeesText(Number(s.freeShippingThresholdMinor)),
    codEnabled: s?.codEnabled ? "on" : "",
    codFeeMinor: paiseToRupeesText(Number(s?.codFeeMinor ?? 0)),
    codMaxOrderMinor: paiseToRupeesText(Number(s?.codMaxOrderMinor ?? 500_000)),
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Lookbook & settings" subtitle="The home page's words, ordering, delivery charges, cash on delivery and how buyers reach you." />
      {saved ? (
        <div className="-mt-4 mb-6">
          <Notice>Saved. The site shows it now.</Notice>
        </div>
      ) : null}
      <div>
        <SettingsForm initial={initial} />
      </div>
    </div>
  );
}
