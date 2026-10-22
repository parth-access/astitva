"use client";

import { useState, type ComponentProps } from "react";

/** A password field with a Show / Hide button, so phone users can check what they typed. */
export function PasswordInput({
  value,
  onChange,
  ...input
}: { value?: string; onChange?: (v: string) => void } & Omit<ComponentProps<"input">, "type" | "value" | "onChange">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="field mt-1.5 !flex items-center gap-2 !py-0 !pr-1.5 focus-within:border-espresso">
      <input
        {...input}
        type={shown ? "text" : "password"}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : {})}
        autoCapitalize="none"
        spellCheck={false}
        className="min-h-12 w-full bg-transparent outline-none"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs text-espresso-soft hover:bg-champagne"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}
