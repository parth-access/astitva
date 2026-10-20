"use client";

import { useActionState } from "react";
import { findOrderAction, type LookupState } from "@/app/(store)/orders/actions";

const empty: LookupState = {};

export function FindOrderForm({ whatsappHref }: { whatsappHref: string | null }) {
  const [state, action, pending] = useActionState(findOrderAction, empty);

  if (state.sent) {
    return (
      <div role="status" className="fade-in space-y-4 bg-champagne p-6">
        <p className="text-lg leading-relaxed">If that order matches that number, we&apos;ve emailed its link to the address on the order. It can take a minute or two.</p>
        <p className="text-sm text-espresso-soft">
          Didn&apos;t give an email when you ordered?{" "}
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="link">
              Message us on WhatsApp
            </a>
          ) : (
            "Message us"
          )}{" "}
          with your order number and we&apos;ll send it there.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? (
        <p role="alert" className="border-l-2 border-burgundy bg-champagne px-4 py-3 text-sm">
          {state.error}
        </p>
      ) : null}
      <label className="block">
        <span className="text-sm">Order number</span>
        <input name="orderNumber" required autoComplete="off" placeholder="AST-001001" defaultValue={state.values?.orderNumber} className="field mt-1.5 uppercase" />
        <span className="mt-1 block text-xs text-espresso-soft">In your order email, or the WhatsApp message from us.</span>
      </label>
      <label className="block">
        <span className="text-sm">Mobile number on the order</span>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="98123 45678" defaultValue={state.values?.phone} className="field mt-1.5" />
      </label>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : "Email me my order"}
      </button>
    </form>
  );
}
