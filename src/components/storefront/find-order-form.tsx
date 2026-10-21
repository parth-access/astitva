"use client";

import { useActionState, useState } from "react";
import { findOrderAction, type LookupState } from "@/app/(store)/orders/actions";

const empty: LookupState = {};

/** The digits of an order number however it was typed or pasted: "AST-001005" → "001005". */
const orderDigits = (s: string) => s.toUpperCase().replace(/^\s*AST[\s-]*/, "").replace(/[^\d]/g, "").slice(0, 6);

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="mt-1.5 block text-sm text-burgundy">
      {message}
    </span>
  );
}

/**
 * Order number and mobile number in, the order's private page emailed out.
 * The answer is the same whether or not anything matched; only the shape of
 * what was typed is ever called wrong.
 */
export function FindOrderForm({ whatsapp }: { whatsapp: string | null }) {
  const [state, action, pending] = useActionState(findOrderAction, empty);
  // "Try different details" puts the form back without forgetting what was typed.
  const [dismissed, setDismissed] = useState<LookupState | null>(null);
  const showSent = state.sent && dismissed !== state;
  const ask = (number?: string) =>
    whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello Astitva, could you send me the link to my order${number ? ` ${number}` : ""}?`)}` : null;

  if (showSent) {
    const help = ask(state.orderNumber);
    return (
      <div role="status" className="fade-in -mx-2 rounded-2xl bg-champagne px-5 py-6 sm:mx-0 sm:p-7">
        <p className="caption text-lg">Sent, if it matched</p>
        <h2 className="mt-1 text-3xl italic sm:text-4xl">Check your inbox</h2>
        <p className="mt-3 leading-relaxed">
          If {state.orderNumber ?? "that order"} was placed with that mobile number, its private page is on its way to the email on the order. It usually takes a minute or two.
        </p>
        <ul className="mt-5 space-y-1.5 text-sm text-espresso-soft">
          <li>· The subject reads &ldquo;Your Astitva order {state.orderNumber ?? "AST-…"}&rdquo;.</li>
          <li>· Nothing yet? Look in Promotions or Spam.</li>
          <li>· We send it at most once an hour for each order.</li>
        </ul>
        <div className="mt-7 flex flex-wrap gap-3">
          {help ? (
            <a href={help} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Ask us on WhatsApp
            </a>
          ) : null}
          <button
            type="button"
            className="btn-outline"
            onClick={() => setDismissed(state)}
          >
            Try different details
          </button>
        </div>
        <p className="mt-5 text-xs text-espresso-soft">No email on your order? WhatsApp is quickest: we&apos;ll send the link there.</p>
      </div>
    );
  }

  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl border-l-4 border-burgundy bg-champagne px-4 py-3 text-sm">
          {state.error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">Order number</span>
        <span className={`field mt-1.5 !flex items-center gap-1 !p-0 focus-within:border-espresso ${f.orderNumber ? "!border-burgundy" : ""}`}>
          <span className="select-none pl-3.5 tracking-wide text-espresso-soft" aria-hidden="true">
            AST-
          </span>
          <input
            name="orderNumber"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="001005"
            defaultValue={state.values ? orderDigits(state.values.orderNumber) : undefined}
            aria-invalid={f.orderNumber ? true : undefined}
            aria-describedby={f.orderNumber ? "order-number-error" : "order-number-hint"}
            onInput={(e) => {
              // Pasting "AST-001005" leaves just the digits, so it never reads "AST-AST-".
              const el = e.currentTarget;
              const digits = orderDigits(el.value);
              if (digits !== el.value) el.value = digits;
            }}
            className="min-h-12 w-full bg-transparent pr-3.5 tracking-wide tabular-nums outline-none placeholder:text-espresso-soft/50"
          />
        </span>
        {f.orderNumber ? (
          <FieldError id="order-number-error" message={f.orderNumber} />
        ) : (
          <span id="order-number-hint" className="mt-1.5 block text-xs text-espresso-soft">
            In the subject of your order email, and in our WhatsApp message.
          </span>
        )}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Mobile number on the order</span>
        <span className={`field mt-1.5 !flex items-center gap-2 !p-0 focus-within:border-espresso ${f.phone ? "!border-burgundy" : ""}`}>
          <span className="select-none border-r border-taupe/50 py-3 pl-3.5 pr-3 text-espresso-soft" aria-hidden="true">
            +91
          </span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="send"
            placeholder="98123 45678"
            maxLength={14}
            defaultValue={state.values?.phone}
            aria-invalid={f.phone ? true : undefined}
            aria-describedby={f.phone ? "phone-error" : undefined}
            className="min-h-12 w-full bg-transparent pr-3.5 tabular-nums outline-none placeholder:text-espresso-soft/50"
          />
        </span>
        <FieldError id="phone-error" message={f.phone} />
      </label>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : "Email me my order"}
      </button>
      <p className="text-center text-xs text-espresso-soft">We email the page to the address on the order. It never shows here, so only you can open it.</p>
    </form>
  );
}
