"use client";

import { useActionState, useState } from "react";
import { cancelOrderAction, verifyOrderAction, type OrderActionState } from "@/app/admin/(panel)/orders/actions";
import { FormError, Notice } from "./ui";

const empty: OrderActionState = {};

/** "Confirmed with the buyer" for a COD order. */
export function VerifyButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(verifyOrderAction.bind(null, orderId), empty);
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error ?? null} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : "Confirmed with the buyer"}
      </button>
    </form>
  );
}

/** Cancel, with a reason the buyer may ask about. Asks twice. */
export function CancelOrder({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(cancelOrderAction.bind(null, orderId), empty);
  const [open, setOpen] = useState(false);
  if (state.done) return <Notice>Cancelled. The pieces are back on sale.</Notice>;
  if (!open) {
    return (
      <button type="button" className="link text-sm text-burgundy" onClick={() => setOpen(true)}>
        Cancel this order…
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3 border-l-2 border-burgundy pl-4">
      <FormError message={state.error ?? null} />
      <label className="block">
        <span className="text-sm font-medium">Why?</span>
        <input
          name="reason"
          required
          maxLength={300}
          placeholder="Buyer asked to cancel on WhatsApp"
          className="mt-1.5 block min-h-12 w-full rounded-[1px] border border-taupe bg-ivory px-3 text-base"
        />
      </label>
      <p className="text-xs text-espresso-soft">The pieces go back on sale at once. This can&apos;t be undone.</p>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel the order"}
        </button>
        <button type="button" className="link text-sm" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </form>
  );
}
