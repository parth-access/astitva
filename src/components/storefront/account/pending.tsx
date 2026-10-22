"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A small turning ring, in the text's colour. Still, for people who'd rather not see motion. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`size-4 shrink-0 animate-spin motion-reduce:animate-none ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** A label with a spinner beside it while `busy`. */
export function Busy({ busy, children, busyLabel }: { busy: boolean; children: ReactNode; busyLabel?: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {busy ? <Spinner /> : null}
      {busy && busyLabel ? busyLabel : children}
    </span>
  );
}

/**
 * A form's submit button that shows it's working: a spinner and `pending`
 * text, and it can't be pressed twice. Works in any <form action={…}>.
 */
export function SubmitButton({ children, pending: pendingLabel, className, ...rest }: { pending?: ReactNode } & ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} disabled={pending || rest.disabled} aria-busy={pending || undefined} className={`${className ?? ""} disabled:cursor-wait`}>
      <Busy busy={pending} busyLabel={pendingLabel}>
        {children}
      </Busy>
    </button>
  );
}
