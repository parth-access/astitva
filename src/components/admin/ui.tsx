import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BACK, FORWARD } from "@/lib/transition-types";

/** Small building blocks for the admin. Plain and calm; the storefront carries the brand. */

export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16 sm:py-24">
      <p className="text-center font-display text-sm tracking-[0.3em] text-espresso-soft">ASTITVA</p>
      <h1 className="mt-6 text-center font-display text-2xl text-espresso">{title}</h1>
      {intro ? <div className="mt-3 text-center text-sm text-espresso-soft">{intro}</div> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

const controlClass =
  "mt-1.5 block w-full rounded-[1px] border border-taupe bg-ivory px-3 text-base text-espresso placeholder:text-espresso-soft/60 focus:border-espresso [&[readonly]]:bg-champagne [&[readonly]]:text-espresso-soft aria-invalid:border-burgundy";

function FieldShell({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-espresso">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-burgundy">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-espresso-soft">{hint}</span>
      ) : null}
    </label>
  );
}

type Extra = { label: string; hint?: string; error?: string };

export function Field({ label, hint, error, ...input }: Extra & ComponentProps<"input">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <input {...input} aria-invalid={error ? true : undefined} className={`${controlClass} min-h-12`} />
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, ...input }: Extra & ComponentProps<"textarea">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <textarea {...input} aria-invalid={error ? true : undefined} className={`${controlClass} py-2.5 leading-relaxed`} />
    </FieldShell>
  );
}

export function Select({ label, hint, error, children, ...input }: Extra & ComponentProps<"select">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <select {...input} aria-invalid={error ? true : undefined} className={`${controlClass} min-h-12`}>
        {children}
      </select>
    </FieldShell>
  );
}

/** The admin's panel: a soft card a shade lighter than the page. */
export const cardClass = "rounded-xl border border-sand/80 bg-paper shadow-[0_1px_2px_rgb(52_37_30/0.05),0_8px_24px_-18px_rgb(52_37_30/0.25)]";

export function Card({ title, intro, action, tone, className = "", children }: { title?: ReactNode; intro?: ReactNode; action?: ReactNode; tone?: "attention" | "calm"; className?: string; children: ReactNode }) {
  const accent = tone === "attention" ? "border-l-4 border-l-burgundy" : tone === "calm" ? "border-l-4 border-l-olive" : "";
  return (
    <section className={`${cardClass} ${accent} p-5 sm:p-6 ${className}`}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="font-display text-xl leading-tight">{title}</h2> : null}
            {intro ? <div className="mt-1 text-sm text-espresso-soft">{intro}</div> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * An editor's Save bar, fixed to the bottom of the screen: above the phone
 * tabs, and beside the sidebar on a computer.
 */
export const saveBarClass =
  "fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-20 border-t border-sand/80 bg-paper/95 shadow-[0_-8px_24px_-20px_rgb(52_37_30/0.4)] backdrop-blur lg:bottom-0 lg:left-64";

/** A titled group of fields in an editor. */
export function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <Card title={title} intro={intro}>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

/** The top of every admin page: where you are, what it is, and its main action. */
export function PageHeader({ title, kicker, subtitle, back, actions }: { title: ReactNode; kicker?: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-8">
      {back ? (
        <Link href={back.href} transitionTypes={BACK} className="mb-3 inline-flex items-center gap-1.5 text-sm text-espresso-soft hover:text-burgundy">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {kicker ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-espresso-soft">{kicker}</p> : null}
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-sm text-espresso-soft">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

export type ChipTone = "attention" | "active" | "done" | "quiet" | "warning";

const CHIP: Record<ChipTone, string> = {
  attention: "bg-burgundy text-ivory",
  active: "bg-olive/15 text-olive ring-1 ring-inset ring-olive/30",
  done: "bg-sand/70 text-espresso",
  quiet: "bg-transparent text-espresso-soft ring-1 ring-inset ring-taupe/50",
  warning: "bg-gold/15 text-[#7a5b2a] ring-1 ring-inset ring-gold/40",
};

/** A small rounded label: an order's state, a piece's stock. */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[tone]}`}>{children}</span>;
}

/** One number on the dashboard; a link when there is something to do about it. */
export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "attention" }) {
  const body = (
    <>
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-espresso-soft">{label}</span>
      <span className={`mt-2 block font-display text-3xl tabular-nums leading-none ${tone === "attention" ? "text-burgundy" : ""}`}>{value}</span>
      {hint ? <span className="mt-2 block text-xs text-espresso-soft">{hint}</span> : null}
    </>
  );
  const cls = `${cardClass} block p-4 sm:p-5 ${tone === "attention" ? "border-l-4 border-l-burgundy" : ""}`;
  return href ? (
    <Link href={href} transitionTypes={FORWARD} className={`${cls} transition-transform hover:-translate-y-0.5 hover:border-taupe`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Switches between views of a list (as links, so each view has its address). */
export function Tabs({ items, current, label }: { items: { key: string; label: string; href: string; count?: number }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-sand/80 bg-paper p-1">
      {items.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${on ? "bg-espresso text-ivory" : "text-espresso-soft hover:bg-champagne hover:text-espresso"}`}
          >
            {t.label}
            {t.count ? <span className={`ml-1.5 tabular-nums ${on ? "text-ivory/80" : "text-burgundy"}`}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** What an empty list says, in a card, so the page doesn't look broken. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${cardClass} px-6 py-12 text-center`}>
      <p className="font-display text-xl">{title}</p>
      {children ? <div className="mt-2 text-sm text-espresso-soft">{children}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: "draft" | "active" | "archived" | "published" }) {
  const label = { draft: "Draft", active: "Published", published: "Published", archived: "Hidden" }[status];
  return <Chip tone={status === "active" || status === "published" ? "active" : status === "archived" ? "done" : "quiet"}>{label}</Chip>;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border-l-4 border-burgundy bg-burgundy/5 px-4 py-2.5 text-sm text-espresso">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border-l-4 border-olive bg-olive/10 px-4 py-2.5 text-sm text-espresso">{children}</p>;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending} aria-disabled={pending}>
      {pending ? "One moment…" : children}
    </button>
  );
}
