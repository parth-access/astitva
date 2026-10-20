import type { OrderStatus } from "@/modules/orders/machines";

const LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * One badge per order. "Needs you" (money taken but the order can't go ahead)
 * comes first; a COD order nobody has confirmed with the buyer reads "To confirm".
 */
export function OrderStatusBadge({
  status,
  method,
  verified,
  needsResolution = false,
}: {
  status: OrderStatus;
  method: "cod" | "online";
  verified: boolean;
  needsResolution?: boolean;
}) {
  const toConfirm = method === "cod" && status === "confirmed" && !verified;
  const label = needsResolution ? "Needs you" : toConfirm ? "To confirm" : LABEL[status];
  const tone =
    needsResolution || toConfirm
      ? "bg-burgundy text-ivory"
      : status === "cancelled" || status === "pending_payment"
        ? "bg-sand text-espresso-soft"
        : status === "delivered"
          ? "border border-taupe text-espresso-soft"
          : "bg-olive text-ivory";
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}
