import type { ComponentProps, ReactNode } from "react";

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

/** A titled group of fields in an editor. */
export function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="border-t border-sand pt-6">
      <h2 className="font-display text-xl">{title}</h2>
      {intro ? <p className="mt-1 text-sm text-espresso-soft">{intro}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "draft" | "active" | "archived" | "published" }) {
  const label = { draft: "Draft", active: "Published", published: "Published", archived: "Hidden" }[status];
  const tone =
    status === "active" || status === "published"
      ? "bg-olive text-ivory"
      : status === "archived"
        ? "bg-sand text-espresso-soft"
        : "border border-taupe text-espresso-soft";
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-burgundy bg-champagne px-3 py-2 text-sm text-espresso">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-olive bg-champagne px-3 py-2 text-sm text-espresso">{children}</p>;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending} aria-disabled={pending}>
      {pending ? "One moment…" : children}
    </button>
  );
}
