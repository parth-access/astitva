import type { OrderStatus } from "@/modules/orders/machines";

const LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** A cash-on-delivery order that nobody has confirmed with the buyer yet reads "To confirm". */
export function OrderStatusBadge({ status, method, verified }: { status: OrderStatus; method: "cod" | "online"; verified: boolean }) {
  const toConfirm = method === "cod" && status === "confirmed" && !verified;
  const label = toConfirm ? "To confirm" : LABEL[status];
  const tone = toConfirm
    ? "bg-burgundy text-ivory"
    : status === "cancelled"
      ? "bg-sand text-espresso-soft"
      : status === "delivered"
        ? "border border-taupe text-espresso-soft"
        : "bg-olive text-ivory";
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}
