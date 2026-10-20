"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmPaymentAction, resumePaymentAction } from "@/app/(store)/checkout/actions";
import { formatINR } from "@/lib/money";
import { openRazorpay } from "./razorpay-window";

/** On the order page of an unpaid online order: open Razorpay's window again. */
export function PayNow({ orderId, linkKey, totalMinor }: { orderId: string; linkKey: string; totalMinor: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "opening" | "confirming">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function pay() {
    setBusy("opening");
    setMessage(null);
    try {
      const opened = await resumePaymentAction(orderId, linkKey);
      if ("error" in opened) {
        setMessage(opened.error);
        return;
      }
      const result = await openRazorpay(opened.payment);
      if (result.kind === "dismissed") {
        setMessage(result.lastError ? `${result.lastError} Nothing has been charged.` : null);
        return;
      }
      setBusy("confirming");
      const confirmed = await confirmPaymentAction(result.reply);
      if ("path" in confirmed) router.replace(confirmed.path);
      else setMessage(confirmed.error);
    } catch {
      setMessage("The payment window couldn't open. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <button type="button" className="btn-primary min-w-56" onClick={pay} disabled={busy !== null}>
        {busy === "confirming" ? "Confirming your payment…" : busy === "opening" ? "Opening payment…" : `Pay ${formatINR(totalMinor)}`}
      </button>
      {message ? (
        <p role="alert" className="mx-auto mt-4 max-w-md text-sm text-burgundy">
          {message}
        </p>
      ) : null}
    </div>
  );
}
