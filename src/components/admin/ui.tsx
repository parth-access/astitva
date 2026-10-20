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

export function Field({ label, hint, ...input }: { label: string; hint?: string } & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-espresso">{label}</span>
      <input
        {...input}
        className="mt-1.5 block min-h-12 w-full rounded-[1px] border border-taupe bg-ivory px-3 text-base text-espresso placeholder:text-espresso-soft/60 focus:border-espresso"
      />
      {hint ? <span className="mt-1 block text-xs text-espresso-soft">{hint}</span> : null}
    </label>
  );
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
