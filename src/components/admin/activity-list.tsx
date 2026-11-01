import Link from "next/link";
import { describeActivity, type ActivityRow, type ActivityTone } from "@/modules/activity/describe";
import { FORWARD } from "@/lib/transition-types";

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayName = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

const DOT: Record<ActivityTone | "plain", string> = {
  bad: "bg-burgundy",
  good: "bg-olive",
  quiet: "bg-sand",
  plain: "bg-taupe",
};

/**
 * The activity log, grouped by day in India's time. `linkTo: false` on a page
 * that's already about the order or piece each line would link to.
 */
export function ActivityList({ rows, linkTo = true }: { rows: ActivityRow[]; linkTo?: boolean }) {
  const days = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const key = dayName.format(r.at);
    days.set(key, [...(days.get(key) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day} aria-label={day}>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-espresso-soft">{day}</h3>
          <ol className="space-y-3 text-sm">
            {list.map((r) => {
              const line = describeActivity(r);
              return (
                <li key={r.id} className="flex gap-3">
                  <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[line.tone ?? "plain"]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {linkTo && line.href ? (
                        <Link href={line.href} transitionTypes={FORWARD} className={`hover:underline ${line.tone === "bad" ? "text-burgundy" : ""}`}>
                          {line.title}
                        </Link>
                      ) : (
                        <span className={line.tone === "bad" ? "text-burgundy" : ""}>{line.title}</span>
                      )}
                    </span>
                    {line.detail ? <span className="block break-words text-espresso-soft">{line.detail}</span> : null}
                    <span className="block text-xs text-espresso-soft tabular-nums">
                      {time.format(r.at)} · {line.who}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
