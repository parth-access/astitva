import { describe, expect, it } from "vitest";
import { describeActivity, type ActivityRow } from "../../src/modules/activity/describe";

const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: "x",
  at: new Date("2026-11-02T10:00:00Z"),
  kind: "order.packed",
  actorName: null,
  actorType: "system",
  meta: null,
  orderId: null,
  orderNumber: null,
  productId: null,
  piece: null,
  color: null,
  size: null,
  category: "orders",
  ...over,
});

describe("describeActivity", () => {
  it("says who did what to which order, and links to it", () => {
    expect(describeActivity(row({ kind: "order.packed", actorName: "Krishna", actorType: "admin", orderId: "abc", orderNumber: "AST-001" }))).toEqual({
      title: "Packed",
      detail: "AST-001",
      who: "Krishna",
      href: "/admin/orders/abc",
      tone: null,
    });
  });

  it("writes a stock movement with its piece, change and what's left", () => {
    const line = describeActivity(row({ kind: "stock.sale", meta: { delta: -1, onHandAfter: 3, reason: null }, piece: "Neem", color: "Ink", size: "M", productId: "p", orderNumber: "AST-002" }));
    expect(line).toMatchObject({ title: "Sold", detail: "Neem, Ink M · -1 · 3 left · AST-002", href: "/admin/pieces/p" });
  });

  it("marks what went wrong", () => {
    expect(describeActivity(row({ kind: "email.order_placed", meta: { status: "failed", to: "a@b.in", error: "Bounced" } }))).toMatchObject({
      title: "Order confirmation",
      detail: "To a@b.in · couldn't be sent: Bounced",
      tone: "bad",
    });
    expect(describeActivity(row({ kind: "admin.sign_in_failed", actorType: "admin", meta: { email: "x@y.in" } }))).toMatchObject({ detail: "x@y.in", who: "A visitor", tone: "bad" });
    expect(describeActivity(row({ kind: "razorpay.payment.failed", actorType: "razorpay", meta: { amount: 349_900 } }))).toMatchObject({ detail: "₹3,499", who: "Razorpay", tone: "bad" });
  });

  it("shows older orders' events without mentioning how they were paid, and never fails on the unknown", () => {
    expect(describeActivity(row({ kind: "cod.remitted" })).title).toBe("Payment received from the courier");
    expect(describeActivity(row({ kind: "something.new" })).title).toBe("something.new");
  });
});
