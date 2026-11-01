import { formatINR } from "@/lib/money";

/**
 * Turns a row of the activity log into a sentence, a link and a tone. Plain
 * data in, plain data out, so it's the one place the log's wording lives.
 */
export const CATEGORIES = [
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "stock", label: "Stock" },
  { key: "pieces", label: "Pieces" },
  { key: "emails", label: "Emails" },
  { key: "customers", label: "Customers" },
  { key: "signins", label: "Sign-ins" },
  { key: "settings", label: "Settings" },
  { key: "system", label: "System" },
] as const;

export type ActivityCategory = (typeof CATEGORIES)[number]["key"];

export type ActivityRow = {
  id: string;
  at: Date;
  kind: string;
  actorName: string | null;
  actorType: string;
  meta: Record<string, unknown> | null;
  orderId: string | null;
  orderNumber: string | null;
  productId: string | null;
  piece: string | null;
  color: string | null;
  size: string | null;
  category: ActivityCategory;
};

export type ActivityTone = "bad" | "good" | "quiet";

export type ActivityLine = {
  title: string;
  detail: string | null;
  who: string;
  href: string | null;
  tone: ActivityTone | null;
};

const ORDER_EVENTS: Record<string, [string, ActivityTone?]> = {
  "order.awaiting_payment": ["Checkout started, waiting for payment", "quiet"],
  "order.placed": ["Order placed", "good"],
  "order.superseded": ["Checkout replaced by a new one from the same bag", "quiet"],
  "order.needs_resolution": ["Flagged: needs you", "bad"],
  "order.packed": ["Packed"],
  "order.unpacked": ["Unpacked"],
  "order.shipped": ["Handed to the courier"],
  "order.delivered": ["Delivered", "good"],
  "order.returned": ["Came back undelivered", "bad"],
  "order.cancelled": ["Cancelled", "bad"],
  "order.resolved": ["Marked as sorted"],
  "payment.captured": ["Payment received", "good"],
  "payment.extra": ["Paid a second time: refund it from Razorpay", "bad"],
  "refund.succeeded": ["Refunded"],
  "refund.failed": ["Refund failed", "bad"],
  // On orders from before the shop took online payment only.
  "cod.verified": ["Confirmed with the buyer"],
  "cod.remitted": ["Payment received from the courier"],
};

const AUDIT: Record<string, [string, ActivityTone?]> = {
  "order.refund_started": ["Refund started"],
  "piece.created": ["Piece created"],
  "piece.updated": ["Piece edited"],
  "piece.status.draft": ["Piece moved to drafts", "quiet"],
  "piece.status.active": ["Piece published", "good"],
  "piece.status.archived": ["Piece archived", "quiet"],
  "piece.photo_added": ["Photo added"],
  "piece.photo_removed": ["Photo removed"],
  "piece.photo_edited": ["Photo cropped or turned"],
  "piece.photo_edit_undone": ["Photo put back as it was"],
  "piece.photo_described": ["Photo description changed"],
  "piece.photo_moved": ["Photos reordered"],
  "piece.photo_colour": ["Photo's colour changed"],
  "piece.photo_angle": ["Photo's angle changed"],
  "piece.spin_added": ["Turntable video added"],
  "piece.spin_removed": ["Turntable video removed"],
  "piece.saved": ["Piece saved to an account"],
  "settings.updated": ["Lookbook and settings changed"],
  "discount.created": ["Discount code created"],
  "discount.enabled": ["Discount code switched on"],
  "discount.disabled": ["Discount code switched off", "quiet"],
  "admin.created": ["Admin added"],
  "admin.role_set": ["Admin's role set"],
  "admin.signed_in": ["Signed in to the admin"],
  "admin.signed_out": ["Signed out of the admin", "quiet"],
  "admin.sign_in_failed": ["Admin sign-in failed", "bad"],
  "admin.code_failed": ["Admin sign-in: wrong 6-digit code", "bad"],
  "admin.password_reset_requested": ["Admin password reset asked for"],
  "customer.signed_in": ["Customer signed in", "quiet"],
  "customer.signed_up": ["New customer account", "good"],
  "customer.deleted": ["Customer deleted their account", "quiet"],
  "alert.requested": ["Asked to hear when it's back"],
  "bag.added": ["Added to a bag"],
  "bag.quantity": ["Quantity changed in a bag", "quiet"],
  "bag.removed": ["Removed from a bag", "quiet"],
  "job.ran": ["Scheduled job did some work", "quiet"],
  "job.failed": ["Scheduled job failed", "bad"],
};

const EMAILS: Record<string, string> = {
  order_placed: "Order confirmation",
  order_link: "Order page link",
  order_shipped: "Shipping email",
  order_cancelled: "Cancellation email",
  refund_succeeded: "Refund email",
  back_in_stock: "Back-in-stock email",
  owner_new_order: "New order alert",
  owner_needs_you: "\"Needs you\" alert",
  owner_error: "Error alert",
};

const STOCK: Record<string, string> = {
  receipt: "Stock added",
  sale: "Sold",
  cancellation_restock: "Back in stock: order cancelled or unpaid",
  return_restock: "Back in stock: parcel returned",
  adjustment: "Stock adjusted",
  damage: "Written off as damaged",
};

const RAZORPAY: Record<string, [string, ActivityTone?]> = {
  "payment.captured": ["Razorpay: payment captured", "good"],
  "payment.authorized": ["Razorpay: payment authorised", "quiet"],
  "payment.failed": ["Razorpay: a payment attempt failed", "bad"],
  "order.paid": ["Razorpay: order paid", "quiet"],
  "refund.created": ["Razorpay: refund created", "quiet"],
  "refund.processed": ["Razorpay: refund processed"],
  "refund.failed": ["Razorpay: refund failed", "bad"],
};

const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const money = (v: unknown) => (typeof v === "number" ? formatINR(v) : null);
const REFUND_METHOD: Record<string, string> = { razorpay: "through Razorpay", manual_upi: "by UPI", manual_bank: "by bank transfer" };

function sentence(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" · ") || null;
}

function who(r: ActivityRow): string {
  if (r.actorName) return r.actorName;
  switch (r.actorType) {
    case "customer":
      return "A customer";
    case "razorpay":
      return "Razorpay";
    case "admin":
      return r.kind.startsWith("bag.") || r.kind === "customer.deleted" || r.kind === "admin.sign_in_failed" || r.kind === "admin.code_failed" || r.kind === "admin.password_reset_requested"
        ? "A visitor"
        : "The system";
    default:
      return "The system";
  }
}

function link(r: ActivityRow): string | null {
  if (r.orderId) return `/admin/orders/${r.orderId}`;
  if (r.productId) return `/admin/pieces/${r.productId}`;
  if (r.kind.startsWith("discount.")) return "/admin/discounts";
  if (r.kind === "settings.updated") return "/admin/settings";
  return null;
}

function details(r: ActivityRow, m: Record<string, unknown>): string | null {
  const variant = [r.color, r.size].filter(Boolean).join(" ");
  const piece = r.piece ? `${r.piece}${variant ? `, ${variant}` : ""}` : null;

  if (r.kind.startsWith("stock.")) {
    const delta = Number(m.delta ?? 0);
    return sentence(piece, `${delta > 0 ? "+" : ""}${delta}`, `${Number(m.onHandAfter ?? 0)} left`, r.orderNumber, text(m.reason));
  }
  if (r.kind.startsWith("email.")) {
    const state = m.status === "sent" ? "sent" : m.status === "failed" ? `couldn't be sent${text(m.error) ? `: ${text(m.error)}` : ""}` : "waiting to send";
    return sentence(r.orderNumber, `To ${text(m.to) ?? "?"}`, state, text(m.title));
  }
  if (r.kind.startsWith("razorpay.")) return sentence(r.orderNumber, money(m.amount ?? m.refundAmount), text(m.error));
  if (r.kind.startsWith("job.")) return sentence(text(m.job), text(m.error), jobWork(m.result));
  if (r.kind.startsWith("discount.")) return text(m.code);
  if (r.kind === "settings.updated") return m.orderingOpen === undefined ? null : `Ordering ${m.orderingOpen ? "open" : "closed"}`;
  if (r.kind === "admin.created" || r.kind === "admin.role_set") return sentence(text(m.email), text(m.role));
  if (r.kind === "admin.sign_in_failed" || r.kind === "admin.password_reset_requested" || r.kind === "customer.signed_up") return text(m.email);
  if (r.kind === "alert.requested") return sentence(piece, text(m.email), m.notifiedAt ? "told" : "waiting");
  if (r.kind.startsWith("bag.")) return sentence(piece, m.quantity ? `× ${String(m.quantity)}` : null);
  if (r.kind.startsWith("refund.") || r.kind === "order.refund_started") {
    return sentence(r.orderNumber, money(m.amountMinor), REFUND_METHOD[String(m.method)] ?? null, text(m.why));
  }
  if (r.kind === "payment.captured" || r.kind === "payment.extra") return sentence(r.orderNumber, money(m.amountMinor), text(m.method));
  if (r.kind === "order.awaiting_payment" || r.kind === "order.placed") return sentence(r.orderNumber, money(m.totalMinor));
  if (r.kind === "order.shipped") return sentence(r.orderNumber, text(m.carrierName), text(m.trackingNumber));
  if (r.orderNumber || text(m.reason) || text(m.note)) return sentence(r.orderNumber, text(m.reason), text(m.note));
  return piece;
}

/** What a scheduled job did, skipping everything that came to nothing. */
function jobWork(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === "number" && v > 0) parts.push(`${k} ${v}`);
    if (v && typeof v === "object") {
      for (const [k2, n] of Object.entries(v)) if (typeof n === "number" && n > 0) parts.push(`${k} ${k2} ${n}`);
    }
  }
  return parts.join(", ") || null;
}

export function describeActivity(r: ActivityRow): ActivityLine {
  const m = r.meta ?? {};
  let title: string;
  let tone: ActivityTone | null = null;
  const known = ORDER_EVENTS[r.kind] ?? AUDIT[r.kind];
  if (known) {
    title = known[0];
    tone = known[1] ?? null;
  } else if (r.kind.startsWith("stock.")) {
    title = STOCK[r.kind.slice(6)] ?? "Stock changed";
    tone = r.kind === "stock.damage" ? "bad" : null;
  } else if (r.kind.startsWith("email.")) {
    title = EMAILS[r.kind.slice(6)] ?? "Email";
    tone = m.status === "failed" ? "bad" : m.status === "pending" ? "quiet" : null;
  } else if (r.kind.startsWith("razorpay.")) {
    const event = RAZORPAY[r.kind.slice(9)];
    title = event?.[0] ?? `Razorpay: ${r.kind.slice(9)}`;
    tone = text(m.error) ? "bad" : (event?.[1] ?? "quiet");
  } else {
    title = r.kind;
  }
  return { title, detail: details(r, m), who: who(r), href: link(r), tone };
}
