import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A guest's private link to their order: /orders/AST-001001?k=<key>. The key
 * is an HMAC of the order id, so nothing extra is stored and order numbers
 * (which count up) can't be guessed into someone else's address.
 */
export function orderLinkKey(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(`order-link:${orderId}`).digest("base64url").slice(0, 32);
}

export function isOrderLinkKey(orderId: string, key: string | null | undefined, secret: string): boolean {
  if (!key) return false;
  const expected = Buffer.from(orderLinkKey(orderId, secret));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function orderPath(orderNumber: string, key: string): string {
  return `/orders/${encodeURIComponent(orderNumber)}?k=${encodeURIComponent(key)}`;
}
