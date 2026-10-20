import { randomUUID } from "node:crypto";
import { createRazorpay, hmacHex, type RazorpayPayment } from "../../src/modules/payments/razorpay";

export const SECRET = "test_secret_value";

/** Stands in for Razorpay's API: remembers orders, and payments we tell it about. */
export function fakeRazorpay(opts: { refundStatus?: "processed" | "pending" | "failed" } = {}) {
  const orderAmounts = new Map<string, number>();
  const paymentsById = new Map<string, RazorpayPayment>();
  let down = false;
  const refunds: { amount: number; notes: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (down) return new Response(JSON.stringify({ error: { description: "Service unavailable" } }), { status: 503 });
    const path = new URL(String(url)).pathname.replace("/v1", "");
    if (init?.method === "POST" && path === "/orders") {
      const body = JSON.parse(String(init.body)) as { amount: number; receipt: string };
      const id = `order_${randomUUID().slice(0, 14)}`;
      orderAmounts.set(id, body.amount);
      return Response.json({ id, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created" });
    }
    const refund = /^\/payments\/([^/]+)\/refund$/.exec(path);
    if (refund) {
      const body = JSON.parse(String(init!.body)) as { amount: number; notes: Record<string, string> };
      refunds.push(body);
      return Response.json({ id: `rfnd_${randomUUID().slice(0, 14)}`, payment_id: refund[1], amount: body.amount, status: opts.refundStatus ?? "processed", notes: body.notes });
    }
    const capture = /^\/payments\/([^/]+)\/capture$/.exec(path);
    if (capture) {
      const p = paymentsById.get(capture[1]!)!;
      p.status = "captured";
      return Response.json(p);
    }
    const fetchP = /^\/payments\/([^/]+)$/.exec(path);
    if (fetchP && paymentsById.has(fetchP[1]!)) return Response.json(paymentsById.get(fetchP[1]!));
    return new Response(JSON.stringify({ error: { description: "Not found" } }), { status: 404 });
  }) as typeof fetch;

  return {
    rzp: createRazorpay({ keyId: "rzp_test_abc", keySecret: SECRET }, fetchImpl),
    setDown: (v: boolean) => (down = v),
    refunds,
    /** The buyer pays in Razorpay's window. Returns what the browser would send back. */
    pay(razorpayOrderId: string, opts: { amount?: number; status?: string } = {}) {
      const id = `pay_${randomUUID().slice(0, 14)}`;
      const payment: RazorpayPayment = {
        id,
        order_id: razorpayOrderId,
        amount: opts.amount ?? orderAmounts.get(razorpayOrderId)!,
        currency: "INR",
        status: opts.status ?? "captured",
        method: "upi",
      };
      paymentsById.set(id, payment);
      return { payment, reply: { razorpayOrderId, razorpayPaymentId: id, signature: hmacHex(SECRET, `${razorpayOrderId}|${id}`) } };
    },
  };
}

