import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/admin/activity-list";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { cardClass, EmptyState, Field, PageHeader, Tabs } from "@/components/admin/ui";
import { db } from "@/db/client";
import { CATEGORIES, type ActivityCategory } from "@/modules/activity/describe";
import { listActivity } from "@/modules/activity/feed";
import { requireAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Activity" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
/** The start of a day in India, or of the day after. */
function dayStart(date: string, addDays = 0): Date | undefined {
  if (!DATE.test(date)) return undefined;
  const at = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(at.getTime())) return undefined;
  return new Date(at.getTime() + addDays * 86_400_000);
}

/** Everything that has happened in the shop: who did what, when. */
export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdmin();
  const params = await searchParams;
  const show = one(params.show);
  const category = CATEGORIES.some((c) => c.key === show) ? (show as ActivityCategory) : undefined;
  const q = one(params.q).slice(0, 80);
  const from = one(params.from);
  const to = one(params.to);
  const before = one(params.before);

  const { rows, next } = await listActivity(db, { category, search: q, from: dayStart(from), to: dayStart(to, 1), before, limit: 50 });

  const href = (over: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries({ show: category ?? "", q, from, to, ...over }).filter(([, v]) => v));
    const text = query.toString();
    return text ? `/admin/activity?${text}` : "/admin/activity";
  };
  const filtered = Boolean(q || from || to);

  return (
    <div className="space-y-6">
      {/* Only the first page follows along: a page further back should stay put. */}
      {before ? null : <AutoRefresh />}
      <PageHeader title="Activity" subtitle="Everything that has happened in the shop, newest first: who did what, and when." />
      <Tabs
        label="Show"
        current={category ?? "all"}
        items={[{ key: "all", label: "All", href: href({ show: "" }) }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, href: href({ show: c.key }) }))]}
      />

      <form action="/admin/activity" className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
        {category ? <input type="hidden" name="show" value={category} /> : null}
        <div className="min-w-48 flex-1">
          <Field label="Search" name="q" defaultValue={q} maxLength={80} placeholder="Order number, name, email, piece" />
        </div>
        <Field label="From" name="from" type="date" defaultValue={from} />
        <Field label="To" name="to" type="date" defaultValue={to} />
        <button type="submit" className="btn-outline">
          Find
        </button>
        {filtered ? (
          <Link href={href({ q: "", from: "", to: "" })} className="link self-center text-sm">
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches" : "Nothing here yet"}>{filtered ? "Try fewer words or a wider range of dates." : "It shows here as soon as it happens."}</EmptyState>
      ) : (
        <div className={`${cardClass} p-5 sm:p-6`}>
          <ActivityList rows={rows} />
          {next || before ? (
            <div className="mt-6 flex justify-between border-t border-sand pt-4 text-sm">
              {before ? (
                <Link href={href({})} className="link">
                  Back to the latest
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={href({ before: next })} className="link">
                  Older
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
