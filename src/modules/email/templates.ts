/**
 * The emails, rendered when they are sent (not when queued), from the order as
 * it stands then. Plain text first; a simple branded HTML version beside it.
 * Buyers' emails carry their private order link; owners' carry the admin link.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { orderItems, orders, refunds, shipments, storeSettings } from "@/db/schema";
import type { Email } from "@/lib/email";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { orderLinkKey, orderPath } from "@/modules/orders/links";

export type TemplateName = "order_placed" | "order_shipped" | "refund_succeeded" | "owner_new_order" | "owner_needs_you" | "owner_error";

export type RenderContext = { appUrl: string; linkSecret: string };

type Rendered = Omit<Email, "to">;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paragraphs of text, and links drawn as a button (in text: "Label: URL"). */
function compose(subject: string, heading: string, blocks: (string | { label: string; url: string })[]): Rendered {
  const text = [heading, "", ...blocks.map((b) => (typeof b === "string" ? b : `${b.label}: ${b.url}`)).flatMap((b) => [b, ""]), "Astitva"].join("\n");
  const body = blocks
    .map((b) =>
      typeof b === "string"
        ? `<p style="margin:0 0 16px;line-height:1.6">${esc(b).replace(/\n/g, "<br>")}</p>`
        : `<p style="margin:24px 0"><a href="${esc(b.url)}" style="background:#6a1d2b;color:#f7f1e7;padding:12px 22px;text-decoration:none;font-size:14px;letter-spacing:.02em">${esc(b.label)}</a></p>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f1e7;color:#34251e;font-family:Helvetica,Arial,sans-serif;font-size:15px">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
<p style="margin:0 0 32px;font-family:Georgia,serif;letter-spacing:.42em;font-size:18px">ASTITVA</p>
<h1 style="margin:0 0 24px;font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:30px;line-height:1.2">${esc(heading)}</h1>
${body}
<p style="margin:40px 0 0;color:#66554a;font-size:12px">Astitva · Your true form</p>
</div></body></html>`;
  return { subject, text, html };
}

async function loadOrder(db: DbOrTx, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
  return { order, items };
}

function itemLines(items: (typeof orderItems.$inferSelect)[]) {
  return items
    .map((i) => {
      const v = [i.variantSnapshot.color, i.variantSnapshot.size].filter(Boolean).join(", ");
      return `${i.productNameSnapshot}${v ? ` (${v})` : ""}${i.quantity > 1 ? ` × ${i.quantity}` : ""}  ${formatINR(Number(i.lineTotalMinor))}`;
    })
    .join("\n");
}

function addressLines(a: (typeof orders.$inferSelect)["addressSnapshot"]) {
  return [a.recipientName, a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : null, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join("\n");
}

/** Null when there is nothing to send any more (the order is gone). */
export async function renderEmail(db: DbOrTx, template: TemplateName, payload: Record<string, unknown>, ctx: RenderContext): Promise<Rendered | null> {
  if (template === "owner_error") {
    return compose(`Astitva: ${String(payload.kind)} failed`, "Something failed", [
      `${String(payload.message ?? "No details.")}`,
      "Nothing was lost: the site keeps going. Check the server logs for the full error, and the order in the admin if one is named.",
    ]);
  }

  const orderId = String(payload.orderId ?? "");
  const loaded = orderId ? await loadOrder(db, orderId) : null;
  if (!loaded) return null;
  const { order, items } = loaded;
  const total = formatINR(Number(order.totalMinor));
  const buyerLink = `${ctx.appUrl}${orderPath(order.orderNumber, orderLinkKey(order.id, ctx.linkSecret))}`;
  const adminLink = `${ctx.appUrl}/admin/orders/${order.id}`;
  const [settings] = await db.select({ who: storeSettings.conciergeName }).from(storeSettings).where(eq(storeSettings.id, 1));
  const who = settings?.who ?? "We";
  const first = order.contactName.split(/\s+/)[0];
  const cod = order.paymentMethod === "cod";

  switch (template) {
    case "order_placed":
      return compose(`Your Astitva order ${order.orderNumber}`, `Thank you, ${first}.`, [
        cod
          ? `${who} will message you on WhatsApp at ${formatMobile(order.contactPhone)} to confirm your order, then we pack it by hand. You pay ${total} when it arrives.`
          : `We've received your payment of ${total}. We'll pack it by hand and let you know when it's on its way.`,
        itemLines(items),
        `Going to:\n${addressLines(order.addressSnapshot)}`,
        { label: "See your order", url: buyerLink },
      ]);

    case "order_shipped": {
      const [s] = await db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.createdAt)).limit(1);
      if (!s) return null;
      return compose(`Your Astitva order is on its way`, "On its way", [
        `Your order ${order.orderNumber} has been packed by hand and handed to ${s.carrierName}. Tracking number ${s.trackingNumber}.${cod ? ` Please keep ${total} ready for the courier.` : ""}`,
        itemLines(items),
        s.trackingUrl ? { label: "Track your parcel", url: s.trackingUrl } : { label: "See your order", url: buyerLink },
      ]);
    }

    case "refund_succeeded": {
      const [r] = await db.select().from(refunds).where(eq(refunds.id, String(payload.refundId ?? "")));
      if (!r) return null;
      const amount = formatINR(Number(r.amountMinor));
      return compose(`Your refund for ${order.orderNumber}`, `We've refunded ${amount}`, [
        r.method === "razorpay"
          ? `${amount} is on its way back to the card or UPI account you paid with. Banks usually take 5–7 working days to show it.`
          : `${amount} has been sent to you by ${r.method === "manual_upi" ? "UPI" : "bank transfer"}.`,
        "If anything doesn't look right, just reply on WhatsApp.",
        { label: "See your order", url: buyerLink },
      ]);
    }

    case "owner_new_order":
      return compose(
        `New order ${order.orderNumber} · ${total} · ${cod ? "cash on delivery" : "paid online"}`,
        `New order from ${first}`,
        [
          `${order.contactName}, ${order.addressSnapshot.city} · ${formatMobile(order.contactPhone)}`,
          itemLines(items),
          cod ? `Cash on delivery, ${total}. Confirm with the buyer on WhatsApp before packing.` : `Paid online, ${total}. Ready to pack.`,
          ...(order.customerNote ? [`Their note: ${order.customerNote}`] : []),
          { label: "Open the order", url: adminLink },
        ],
      );

    case "owner_needs_you":
      return compose(`Needs you: ${order.orderNumber}`, "An order needs you", [
        order.resolutionNote ?? "An order was flagged.",
        `${order.contactName} · ${formatMobile(order.contactPhone)} · ${total}`,
        { label: "Open the order", url: adminLink },
      ]);
  }
}
