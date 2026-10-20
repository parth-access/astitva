import type { Metadata } from "next";
import { DiscountForm, DiscountToggle } from "@/components/admin/discount-form";
import { Section } from "@/components/admin/ui";
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
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl">Discounts</h1>
      <p className="mt-2 text-sm text-espresso-soft">
        Codes buyers type at checkout. They come off the pieces, never shipping. A cancelled or unpaid order gives its use back.
      </p>

      {codes.length ? (
        <ul className="mt-8 divide-y divide-sand border-y border-sand">
          {codes.map((c) => {
            const s = status(c, now);
            return (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
                <div>
                  <span className="font-medium tracking-wide">{c.code}</span>
                  <span className="ml-3 text-sm">{describeRule({ kind: c.kind, value: c.value })}</span>
                  <span className="block text-xs text-espresso-soft">
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
                <div className="flex items-baseline gap-5 text-sm">
                  <span className="tabular-nums text-espresso-soft">
                    {c.usesCount}
                    {c.maxUses !== null ? ` of ${c.maxUses}` : ""} used
                  </span>
                  <span className={s === "Live" ? "text-olive" : "text-espresso-soft"}>{s}</span>
                  <DiscountToggle id={c.id} isActive={c.isActive} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-8 text-espresso-soft">No codes yet.</p>
      )}

      <div className="mt-12">
        <Section title="New code">
          <DiscountForm />
        </Section>
      </div>
    </div>
  );
}
