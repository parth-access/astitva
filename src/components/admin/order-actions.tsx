"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  cancelOrderAction,
  deliveredAction,
  packOrderAction,
  refundAction,
  remittedAction,
  resolveAction,
  returnedAction,
  shipOrderAction,
  unpackOrderAction,
  verifyOrderAction,
  type OrderActionState,
} from "@/app/admin/(panel)/orders/actions";
import { paiseToRupeesText } from "@/lib/money";
import { Field, FormError, Select } from "./ui";

const empty: OrderActionState = {};
type Bound = (prev: OrderActionState, form: FormData) => Promise<OrderActionState>;

/** One click, no fields. */
function ActionButton({ action, label, pending: pendingLabel, variant = "primary" }: { action: Bound; label: string; pending: string; variant?: "primary" | "outline" | "link" }) {
  const [state, run, pending] = useActionState(action, empty);
  const cls = variant === "primary" ? "btn-primary w-full" : variant === "outline" ? "btn-outline w-full" : "link text-sm";
  return (
    <form action={run} className="space-y-2">
      <FormError message={state.error ?? null} />
      <button type="submit" className={cls} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

/** A few fields and a button; optionally folded behind a link until needed. */
function ActionForm({
  action,
  submit,
  pending: pendingLabel,
  trigger,
  danger,
  note,
  children,
}: {
  action: Bound;
  submit: string;
  pending: string;
  /** Shown as a link until clicked. */
  trigger?: string;
  danger?: boolean;
  note?: ReactNode;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, empty);
  const [open, setOpen] = useState(!trigger);
  // Fold a triggered form away once it has done its job.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.done && trigger) setOpen(false);
  }
  if (!open) {
    return (
      <button type="button" className={`link text-sm ${danger ? "text-burgundy" : ""}`} onClick={() => setOpen(true)}>
        {trigger}
      </button>
    );
  }
  return (
    <form action={run} className={`space-y-3 ${trigger ? `border-l-2 pl-4 ${danger ? "border-burgundy" : "border-taupe"}` : ""}`}>
      <FormError message={state.error ?? null} />
      {children}
      {note ? <p className="text-xs text-espresso-soft">{note}</p> : null}
      <div className="flex items-center gap-4">
        <button type="submit" className={trigger ? "btn-primary" : "btn-primary w-full"} disabled={pending}>
          {pending ? pendingLabel : submit}
        </button>
        {trigger ? (
          <button type="button" className="link text-sm" onClick={() => setOpen(false)}>
            Never mind
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function VerifyButton({ orderId }: { orderId: string }) {
  return <ActionButton action={verifyOrderAction.bind(null, orderId)} label="Confirmed with the buyer" pending="One moment…" />;
}

export function CancelOrder({ orderId }: { orderId: string }) {
  return (
    <ActionForm
      action={cancelOrderAction.bind(null, orderId)}
      trigger="Cancel this order…"
      danger
      submit="Cancel the order"
      pending="Cancelling…"
      note="The pieces go back on sale at once. This can't be undone."
    >
      <Field label="Why?" name="reason" required maxLength={300} placeholder="Buyer asked to cancel on WhatsApp" />
    </ActionForm>
  );
}

export function PackButton({ orderId }: { orderId: string }) {
  return <ActionButton action={packOrderAction.bind(null, orderId)} label="Packed" pending="One moment…" variant="outline" />;
}

export function UnpackButton({ orderId }: { orderId: string }) {
  return <ActionButton action={unpackOrderAction.bind(null, orderId)} label="Not packed after all" pending="One moment…" variant="link" />;
}

const COURIERS = ["Delhivery", "Blue Dart", "DTDC", "India Post", "Xpressbees", "Ekart", "Shadowfax", "Shiprocket"];

export function ShipForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={shipOrderAction.bind(null, orderId)} submit="Handed to the courier" pending="Saving…" note="The buyer sees the tracking on their order page.">
      <Field label="Courier" name="carrierName" list="couriers" required maxLength={80} placeholder="Delhivery" />
      <datalist id="couriers">
        {COURIERS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Tracking (AWB) number" name="trackingNumber" required maxLength={80} />
      <Field label="Tracking link (optional)" name="trackingUrl" type="url" placeholder="https://" />
    </ActionForm>
  );
}

export function DeliveredButton({ orderId }: { orderId: string }) {
  return <ActionButton action={deliveredAction.bind(null, orderId)} label="Delivered" pending="One moment…" />;
}

export function ReturnedForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm
      action={returnedAction.bind(null, orderId)}
      trigger="It came back undelivered…"
      danger
      submit="Mark as returned"
      pending="Saving…"
      note="The pieces go back on sale. A paid order is flagged for a refund."
    >
      <Field label="What happened?" name="reason" required maxLength={300} placeholder="Refused at the door" />
    </ActionForm>
  );
}

export function RemittedForm({ orderId, amountMinor }: { orderId: string; amountMinor: number }) {
  return (
    <ActionForm action={remittedAction.bind(null, orderId)} submit="The courier has paid us" pending="Saving…" note={`Mark it once ₹${paiseToRupeesText(amountMinor)} is in the bank.`}>
      <Field label="Remittance reference (optional)" name="reference" maxLength={120} />
    </ActionForm>
  );
}

export function ResolveForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={resolveAction.bind(null, orderId)} trigger="Mark as sorted…" submit="Sorted" pending="Saving…">
      <Field label="What did you do?" name="note" required maxLength={300} placeholder="Sent Ink M instead, buyer agreed" />
    </ActionForm>
  );
}

export function RefundForm({ orderId, refundableMinor, razorpay }: { orderId: string; refundableMinor: number; razorpay: boolean }) {
  const [method, setMethod] = useState(razorpay ? "razorpay" : "manual_upi");
  return (
    <ActionForm
      action={refundAction.bind(null, orderId)}
      trigger="Refund…"
      submit="Refund"
      pending="Refunding…"
      note={
        method === "razorpay"
          ? "Goes back to the card or UPI it came from, usually within 5–7 working days."
          : "Record a refund you have already sent yourself."
      }
    >
      <Field label="Amount (₹)" name="amount" inputMode="decimal" required defaultValue={paiseToRupeesText(refundableMinor)} hint={`Up to ₹${paiseToRupeesText(refundableMinor)}.`} />
      <Select label="How" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
        {razorpay ? <option value="razorpay">Through Razorpay</option> : null}
        <option value="manual_upi">I sent it by UPI</option>
        <option value="manual_bank">I sent it by bank transfer</option>
      </Select>
      {method !== "razorpay" ? <Field label="UPI or bank reference (optional)" name="reference" maxLength={80} /> : null}
      <Field label="Why?" name="reason" required maxLength={300} placeholder="Came back undelivered" />
    </ActionForm>
  );
}
