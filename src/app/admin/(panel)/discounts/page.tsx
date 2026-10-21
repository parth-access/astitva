import type { Metadata } from "next";
import { DiscountForm, DiscountToggle } from "@/components/admin/discount-form";
import { cardClass, Chip, EmptyState, PageHeader, Section } from "@/components/admin/ui";
import { db } from "@/db/client";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { describeRule, listCodes } from "@/modules/discounts/service";

export const metadata: Metadata = { title: "Discounts" };

const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function status(c: Awaited<ReturnType<typeof listCodes>>[number], now: Date) {
  if (!c.isActive) return "Off";
  if (c.startsAt && c.startsAt > now) return `From ${day.format(c.startsAt)}`;
  if (c.endsAt && c.endsAt <= now) return "Ended";
  if (c.maxUses !== null && c.usesCount >= c.maxUses) return "Used up";
  return "Live";
}

export default async function DiscountsPage() {
  await requireAdmin({ roles: ["owner"] });
  const codes = await listCodes(db);
  const now = new Date();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Discount codes" subtitle="Codes buyers type at checkout. They come off the pieces, never shipping. A cancelled or unpaid order gives its use back." />

      {codes.length ? (
        <ul className={`${cardClass} divide-y divide-sand/70`}>
          {codes.map((c) => {
            const s = status(c, now);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
                <div className="min-w-0">
                  <span className="rounded-md bg-champagne px-2 py-0.5 font-mono text-sm font-medium tracking-wider">{c.code}</span>
                  <span className="ml-3 text-sm">{describeRule({ kind: c.kind, value: c.value })}</span>
                  <span className="mt-1 block text-xs text-espresso-soft">
                    {[
                      Number(c.minSubtotalMinor) ? `On ${formatINR(Number(c.minSubtotalMinor))}+` : null,
                      c.endsAt ? `until ${day.format(c.endsAt)}` : null,
                      c.onePerPhone ? "once per number" : null,
                      c.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums text-espresso-soft">
                    {c.usesCount}
                    {c.maxUses !== null ? ` of ${c.maxUses}` : ""} used
                  </span>
                  <Chip tone={s === "Live" ? "active" : "quiet"}>{s}</Chip>
                  <DiscountToggle id={c.id} isActive={c.isActive} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No codes yet">Make one below, e.g. LAUNCH10 for 10% off.</EmptyState>
      )}

      <div className="mt-8">
        <Section title="New code">
          <DiscountForm />
        </Section>
      </div>
    </div>
  );
}
