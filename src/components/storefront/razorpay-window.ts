"use client";

import type { CheckoutSession } from "@/modules/payments/service";

/** Razorpay's Standard Checkout script, loaded only when someone pays. */
const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type Reply = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };

let loading: Promise<RazorpayCtor> | null = null;

function loadScript(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay did not load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Razorpay could not be reached"));
    };
    document.head.append(s);
  });
  return loading;
}

export type WindowResult =
  | { kind: "paid"; reply: { razorpayOrderId: string; razorpayPaymentId: string; signature: string } }
  /** Closed without paying (they can try again; the stock stays held for a while). */
  | { kind: "dismissed"; lastError: string | null };

/** Opens Razorpay's payment window and resolves when it's done or closed. */
export async function openRazorpay(session: CheckoutSession): Promise<WindowResult> {
  const Razorpay = await loadScript();
  return new Promise((resolve) => {
    let lastError: string | null = null;
    const rzp = new Razorpay({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      amount: session.amountMinor,
      currency: "INR",
      name: "Astitva",
      description: `Order ${session.orderNumber}`,
      prefill: { name: session.prefill.name, email: session.prefill.email ?? undefined, contact: session.prefill.contact },
      theme: { color: "#6a1d2b" },
      // Keep the buyer in the window after a failed attempt so they can try another way.
      retry: { enabled: true },
      handler: (r: Reply) =>
        resolve({ kind: "paid", reply: { razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature } }),
      modal: { ondismiss: () => resolve({ kind: "dismissed", lastError }), confirm_close: true },
    });
    rzp.on("payment.failed", (r) => {
      lastError = r.error?.description ?? "The payment didn't go through.";
    });
    rzp.open();
  });
}
