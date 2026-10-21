import type { OrderStatus } from "@/modules/orders/machines";
import { Chip, type ChipTone } from "./ui";

const LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Came back",
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
  const tone: ChipTone =
    needsResolution || toConfirm
      ? "attention"
      : status === "cancelled" || status === "pending_payment" || status === "returned"
        ? "quiet"
        : status === "delivered"
          ? "done"
          : "active";
  return <Chip tone={tone}>{label}</Chip>;
}
