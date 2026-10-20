"use client";

import { useState, useTransition } from "react";
import { subscribeRestockAction, type AlertResult } from "@/app/(store)/alerts/actions";

/** Under a sold-out colour and size: leave an email, hear once when it's back. */
export function RestockAlert({ variantId, label }: { variantId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<AlertResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <p role="status" className="fade-in mt-3 text-sm text-olive">
        {result.message}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="link-draw mt-3 text-sm" onClick={() => setOpen(true)}>
        Tell me when {label} is back
      </button>
    );
  }
  return (
    <form
      className="fade-in mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await subscribeRestockAction(variantId, email)));
      }}
    >
      <label className="block text-sm" htmlFor={`alert-${variantId}`}>
        Your email, for one note when {label} is back
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`alert-${variantId}`}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field min-w-0 flex-1"
          placeholder="you@example.com"
        />
        <button type="submit" className="btn-outline shrink-0" disabled={pending}>
          {pending ? "…" : "Notify me"}
        </button>
      </div>
      {result && !result.ok ? (
        <p role="alert" className="mt-2 text-sm text-burgundy">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
