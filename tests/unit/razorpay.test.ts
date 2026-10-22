import { describe, expect, it } from "vitest";
import { createRazorpay, describeError, hmacHex, isWebhookSignature } from "../../src/modules/payments/razorpay";

describe("Razorpay signatures", () => {
  const rzp = createRazorpay({ keyId: "rzp_test_x", keySecret: "secret" }, (() => {
    throw new Error("no network in unit tests");
  }) as unknown as typeof fetch);

  it("accepts the checkout reply only when signed over order|payment with the key secret", () => {
    const good = hmacHex("secret", "order_1|pay_1");
    expect(rzp.isCheckoutSignature("order_1", "pay_1", good)).toBe(true);
    expect(rzp.isCheckoutSignature("order_1", "pay_2", good)).toBe(false);
    expect(rzp.isCheckoutSignature("order_1", "pay_1", hmacHex("other", "order_1|pay_1"))).toBe(false);
    expect(rzp.isCheckoutSignature("order_1", "pay_1", "short")).toBe(false);
  });

  it("checks webhooks over the exact raw body", () => {
    const body = '{"event":"payment.captured"}';
    const sig = hmacHex("whsec", body);
    expect(isWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(isWebhookSignature(body + " ", sig, "whsec")).toBe(false);
    expect(isWebhookSignature(body, null, "whsec")).toBe(false);
  });

  it("knows test keys", () => {
    expect(rzp.testMode).toBe(true);
    expect(createRazorpay({ keyId: "rzp_live_x", keySecret: "s" }).testMode).toBe(false);
  });

  it("keeps the details Razorpay gives with an error, without its NA placeholders", async () => {
    expect(describeError({ description: "invalid request sent", reason: "refund_not_supported", source: "business", step: "NA", field: null })).toBe(
      "invalid request sent (reason: refund_not_supported, source: business)",
    );
    expect(describeError({ description: "Bad amount", reason: "NA" })).toBe("Bad amount");

    const refusing = createRazorpay({ keyId: "rzp_test_x", keySecret: "s" }, (async () =>
      new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "invalid request sent", reason: "input_validation_failed", source: "business", step: "payment_initiation" } }), {
        status: 400,
      })) as unknown as typeof fetch);
    await expect(refusing.refundPayment("pay_1", 100, {})).rejects.toThrow(
      "Razorpay POST /payments/pay_1/refund failed (400): invalid request sent (reason: input_validation_failed, source: business, step: payment_initiation)",
    );
  });
});
