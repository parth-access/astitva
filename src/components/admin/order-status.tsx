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

/** One badge per order. "Needs you" (money taken but the order can't go ahead) comes first. */
export function OrderStatusBadge({
  status,
  needsResolution = false,
}: {
  status: OrderStatus;
  method: "cod" | "online";
  needsResolution?: boolean;
}) {
  const label = needsResolution ? "Needs you" : LABEL[status];
  const tone: ChipTone =
    needsResolution
      ? "attention"
      : status === "cancelled" || status === "pending_payment" || status === "returned"
        ? "quiet"
        : status === "delivered"
          ? "done"
          : "active";
  return <Chip tone={tone}>{label}</Chip>;
}
