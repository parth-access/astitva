import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/lib/state-machine";
import {
  codCollectionMachine,
  isCancellable,
  chapterMachine,
  orderMachine,
  productMachine,
  paymentAttemptMachine,
  refundMachine,
  reservationMachine,
} from "@/modules/orders/machines";

describe("order machine", () => {
  it("follows the happy path", () => {
    const path = ["pending_payment", "confirmed", "packed", "shipped", "delivered"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => orderMachine.assertTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("allows cancelling only before dispatch", () => {
    expect(isCancellable("pending_payment")).toBe(true);
    expect(isCancellable("confirmed")).toBe(true);
    expect(isCancellable("packed")).toBe(true);
    expect(isCancellable("shipped")).toBe(false);
    expect(isCancellable("delivered")).toBe(false);
  });

  it("rejects skipping or reversing steps", () => {
    expect(() => orderMachine.assertTransition("pending_payment", "shipped")).toThrow(InvalidTransitionError);
    expect(() => orderMachine.assertTransition("delivered", "confirmed")).toThrow(InvalidTransitionError);
    expect(() => orderMachine.assertTransition("cancelled", "confirmed")).toThrow(InvalidTransitionError);
  });

  it("has terminal states that go nowhere", () => {
    expect([...orderMachine.terminal].sort()).toEqual(["cancelled", "delivered"]);
  });
});

describe("other machines", () => {
  it("payment attempts end in captured or failed", () => {
    expect(paymentAttemptMachine.can("created", "captured")).toBe(true);
    expect(paymentAttemptMachine.can("failed", "captured")).toBe(false);
    expect(paymentAttemptMachine.can("captured", "failed")).toBe(false);
  });

  it("reservations cannot be revived once expired or released", () => {
    expect(reservationMachine.can("active", "committed")).toBe(true);
    expect(reservationMachine.can("committed", "released")).toBe(true);
    expect(reservationMachine.can("expired", "committed")).toBe(false);
    expect(reservationMachine.can("released", "active")).toBe(false);
  });

  it("COD money must be collected before it is remitted", () => {
    expect(codCollectionMachine.can("pending", "remitted")).toBe(false);
    expect(codCollectionMachine.can("collected_by_courier", "remitted")).toBe(true);
  });

  it("refunds are final once resolved", () => {
    expect(refundMachine.can("succeeded", "failed")).toBe(false);
  });
});

describe("catalogue machines", () => {
  it("publishes, hides and restores a piece, but never unpublishes it to draft", () => {
    expect(productMachine.can("draft", "active")).toBe(true);
    expect(productMachine.can("active", "archived")).toBe(true);
    expect(productMachine.can("archived", "active")).toBe(true);
    expect(productMachine.can("active", "draft")).toBe(false);
    expect(productMachine.can("archived", "draft")).toBe(false);
  });

  it("publishes and unpublishes a chapter", () => {
    expect(chapterMachine.can("draft", "published")).toBe(true);
    expect(chapterMachine.can("published", "draft")).toBe(true);
  });
});
