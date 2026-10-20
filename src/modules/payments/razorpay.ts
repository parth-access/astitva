/**
 * The few Razorpay calls we make, over its REST API (no SDK), and the two
 * signature checks. Framework-free; `fetch` is injectable so tests can stand
 * in for Razorpay.
 *
 * Docs: Orders API (create), Payments API (fetch, capture), Standard
 * Checkout signature (order_id|payment_id), webhook signature (raw body).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayKeys = { keyId: string; keySecret: string };

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string | null; status: string };
export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method?: string;
  error_description?: string | null;
};

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

export type Razorpay = {
  keyId: string;
  /** Test keys start rzp_test_: no money moves. */
  testMode: boolean;
  createOrder(input: { amountMinor: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  capturePayment(paymentId: string, amountMinor: number): Promise<RazorpayPayment>;
  /** Standard Checkout's handler signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
  isCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
};

const API = "https://api.razorpay.com/v1";

function sameHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Webhooks are signed over the raw request body with the webhook secret (set in the dashboard). */
export function isWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature) return false;
  return sameHex(hmacHex(webhookSecret, rawBody), signature);
}

export function createRazorpay(keys: RazorpayKeys, fetchImpl: typeof fetch = fetch): Razorpay {
  const auth = `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: auth, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // Razorpay's error body names the problem; it never contains card data.
      let reason = text.slice(0, 300);
      try {
        reason = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? reason;
      } catch {}
      throw new RazorpayError(`Razorpay ${method} ${path.split("?")[0]} failed (${res.status}): ${reason}`, res.status);
    }
    return JSON.parse(text) as T;
  }

  return {
    keyId: keys.keyId,
    testMode: keys.keyId.startsWith("rzp_test_"),
    createOrder: ({ amountMinor, receipt, notes }) =>
      call<RazorpayOrder>("POST", "/orders", { amount: amountMinor, currency: "INR", receipt, notes }),
    fetchPayment: (paymentId) => call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`),
    capturePayment: (paymentId, amountMinor) =>
      call<RazorpayPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountMinor, currency: "INR" }),
    isCheckoutSignature: (orderId, paymentId, signature) => sameHex(hmacHex(keys.keySecret, `${orderId}|${paymentId}`), signature),
  };
}
