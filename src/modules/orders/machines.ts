import { defineMachine } from "@/lib/state-machine";
import type {
  codCollectionStatus,
  orderPaymentStatus,
  orderStatus,
  paymentAttemptStatus,
  productStatus,
  refundStatus,
  reservationStatus,
} from "@/db/schema";

type EnumValues<E extends { enumValues: readonly string[] }> = E["enumValues"][number];

export type OrderStatus = EnumValues<typeof orderStatus>;
export type OrderPaymentStatus = EnumValues<typeof orderPaymentStatus>;
export type PaymentAttemptStatus = EnumValues<typeof paymentAttemptStatus>;
export type ReservationStatus = EnumValues<typeof reservationStatus>;
export type CodCollectionStatus = EnumValues<typeof codCollectionStatus>;
export type RefundStatus = EnumValues<typeof refundStatus>;
export type ProductStatus = EnumValues<typeof productStatus>;

/**
 * Fulfilment lifecycle. Returns happen after `delivered` through return
 * requests (post-launch), so `delivered` is terminal here. Cancelling after
 * dispatch is not allowed: that is a return or an RTO, not a cancellation.
 */
export const orderMachine = defineMachine<OrderStatus>("order", {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "confirmed", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
});

/** One Razorpay payment attempt. An order may have several. */
export const paymentAttemptMachine = defineMachine<PaymentAttemptStatus>("payment_attempt", {
  created: ["authorized", "captured", "failed"],
  authorized: ["captured", "failed"],
  captured: [],
  failed: [],
});

/** Money received for the order as a whole, derived from captures and refunds. */
export const orderPaymentMachine = defineMachine<OrderPaymentStatus>("order_payment", {
  unpaid: ["paid"],
  paid: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  refunded: [],
});

export const reservationMachine = defineMachine<ReservationStatus>("reservation", {
  active: ["committed", "released", "expired"],
  committed: ["released"], // released = cancelled before dispatch, stock goes back
  released: [],
  expired: [],
});

/** Delivered does not mean collected; collected does not mean remitted. */
export const codCollectionMachine = defineMachine<CodCollectionStatus>("cod_collection", {
  pending: ["collected_by_courier", "failed"],
  collected_by_courier: ["remitted"],
  remitted: [],
  failed: [],
});

export const refundMachine = defineMachine<RefundStatus>("refund", {
  initiated: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
});

/** Statuses from which a customer or admin may still cancel the order. */
export function isCancellable(status: OrderStatus): boolean {
  return orderMachine.can(status, "cancelled");
}

/**
 * A piece in the catalogue. "active" is published; "archived" is hidden from
 * the site (sold pieces stay active so the archive can show them). Products
 * are never deleted, and a published piece never goes back to draft: its
 * number and web address are already public.
 */
export const productMachine = defineMachine<ProductStatus>("product", {
  draft: ["active", "archived"],
  active: ["archived"],
  archived: ["active"],
});
