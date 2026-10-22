/**
 * The emails, rendered when they are sent (not when queued), from the order as
 * it stands then. Each has a plain-text version and an HTML letter built from
 * the blocks in ./layout: the pieces in their arches, where the order is,
 * Krishna's note on how she'd wear it. Buyers' emails carry their private
 * order link; owners' carry the admin link. Order and shipping emails also
 * carry schema.org markup, which Gmail can show as an order card.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { orderItems, orders, productImages, productVariants, products, refunds, shipments, storeSettings } from "@/db/schema";
import { PACKED_BY_HAND, showPromise } from "@/content/brand";
import type { Email } from "@/lib/email";
import { formatPieceNumber, whatsappLink } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR, paiseToRupeesText } from "@/lib/money";
import { orderLinkKey, orderPath } from "@/modules/orders/links";
import {
  button,
  C,
  clear,
  code,
  columns,
  esc,
  heading,
  heroPiece,
  kicker,
  mascot,
  panel,
  paragraph,
  pieces,
  progress,
  quote,
  rule,
  shell,
  signoff,
  totals,
  type EmailPiece,
} from "./layout";

export type TemplateName = "order_placed" | "order_link" | "order_shipped" | "refund_succeeded" | "back_in_stock" | "owner_new_order" | "owner_needs_you" | "owner_error";

export type RenderContext = { appUrl: string; linkSecret: string };

type Rendered = Omit<Email, "to">;

/** The plain-text twin: a heading, then paragraphs and "Label: URL" links. */
function textOf(head: string, blocks: (string | { label: string; url: string } | null | false)[]) {
  return [head, "", ...blocks.filter((b): b is string | { label: string; url: string } => Boolean(b)).flatMap((b) => [typeof b === "string" ? b : `${b.label}: ${b.url}`, ""]), "Astitva"].join("\n");
}

/* ------------------------------------------------------------------ */
/* What an email needs to know                                         */
/* ------------------------------------------------------------------ */

async function loadSettings(db: DbOrTx) {
  const [s] = await db
    .select({ who: storeSettings.conciergeName, whatsapp: storeSettings.supportWhatsapp })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));
  return { who: s?.who ?? null, whatsapp: s?.whatsapp ?? null };
}

async function loadOrder(db: DbOrTx, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  // Each line with its piece as it is now (number, name, notes) and a photo of the colour bought, if there is one.
  const items = await db
    .select({
      item: orderItems,
      slug: products.slug,
      pieceNumber: products.pieceNumber,
      pieceName: products.pieceName,
      plainName: products.name,
      stylingNote: products.stylingNote,
      care: products.careInstructions,
      tone: products.tone,
      colourHex: productVariants.colorHex,
      photo: sql<string | null>`(
        select ${productImages.url} from ${productImages}
        where ${productImages.productId} = ${products.id}
          and (${productImages.color} is null or ${productImages.color} = ${orderItems.variantSnapshot}->>'color')
        order by (${productImages.color} is null), ${productImages.sortOrder}
        limit 1)`,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));
  return { order, items };
}

type Order = typeof orders.$inferSelect;
type Line = NonNullable<Awaited<ReturnType<typeof loadOrder>>>["items"][number];

const variantText = (i: (typeof orderItems.$inferSelect)) => [i.variantSnapshot.color, i.variantSnapshot.size].filter(Boolean).join(", ");

function emailPieces(lines: Line[], appUrl: string): EmailPiece[] {
  return lines.map((l) => {
    const v = variantText(l.item);
    return {
      title: l.pieceName ?? l.item.productNameSnapshot,
      number: l.pieceNumber ? formatPieceNumber(l.pieceNumber) : null,
      // "Linen wrap dress · Sage, S": the plain description, as the name and number are above it.
      detail: [l.pieceName ? l.plainName : null, v, l.item.quantity > 1 ? `× ${l.item.quantity}` : null].filter(Boolean).join(" · "),
      price: formatINR(Number(l.item.unitPriceMinor) * l.item.quantity),
      photo: l.photo,
      tone: l.colourHex ?? l.tone,
      url: l.slug ? `${appUrl}/pieces/${l.slug}${l.item.variantSnapshot.color ? `?colour=${encodeURIComponent(l.item.variantSnapshot.color)}` : ""}` : null,
    };
  });
}

function itemLines(lines: Line[], order?: Order) {
  const out = lines.map((l) => {
    const v = variantText(l.item);
    // Shown at full price; a discount is its own line below.
    return `${l.item.productNameSnapshot}${v ? ` (${v})` : ""}${l.item.quantity > 1 ? ` × ${l.item.quantity}` : ""}  ${formatINR(Number(l.item.unitPriceMinor) * l.item.quantity)}`;
  });
  if (order && Number(order.discountMinor) > 0) out.push(`Discount${order.discountCode ? ` (${order.discountCode})` : ""}  −${formatINR(Number(order.discountMinor))}`);
  if (order) out.push(`Total  ${formatINR(Number(order.totalMinor))}`);
  return out.join("\n");
}

function totalRows(order: Order): [string, string][] {
  const rows: [string, string][] = [["Pieces", formatINR(Number(order.subtotalMinor))]];
  if (Number(order.discountMinor) > 0) rows.push([`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`, `−${formatINR(Number(order.discountMinor))}`]);
  rows.push(["Delivery", Number(order.shippingMinor) ? formatINR(Number(order.shippingMinor)) : "Free"]);
  if (Number(order.codFeeMinor) > 0) rows.push(["Cash on delivery fee", formatINR(Number(order.codFeeMinor))]);
  const unpaidCod = order.paymentMethod === "cod" && order.paymentStatus === "unpaid";
  rows.push([unpaidCod ? "To pay on delivery" : "Total", formatINR(Number(order.totalMinor))]);
  return rows;
}

function addressLines(a: Order["addressSnapshot"]) {
  return [a.recipientName, a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : null, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join("\n");
}

/** The steps of an order, and which one it's on (the first not yet done). */
function journey(order: Order): { steps: string[]; current: number } {
  const s = order.orderStatus;
  const cod = order.paymentMethod === "cod";
  const done = [
    true,
    cod ? order.codVerifiedAt !== null : order.paymentStatus !== "unpaid",
    s === "packed" || s === "shipped" || s === "delivered",
    s === "shipped" || s === "delivered",
    s === "delivered",
  ];
  const current = done.findIndex((d) => !d);
  return { steps: ["Placed", cod ? "Confirmed" : "Paid", "Packed", "On its way", "With you"], current: current === -1 ? done.length : current };
}

/** The first piece Krishna has written a styling note for. */
function noteToShare(lines: Line[]) {
  const l = lines.find((x) => x.stylingNote);
  return l ? { title: l.pieceName ?? l.item.productNameSnapshot, note: l.stylingNote! } : null;
}

function careToShare(lines: Line[]) {
  const l = lines.find((x) => x.care);
  return l ? { title: l.pieceName ?? l.item.productNameSnapshot, care: l.care! } : null;
}

/** "Its card will read Nº 01, Neem." For a single numbered piece; a few, listed. */
function cardPromise(lines: Line[]) {
  const named = lines.filter((l) => l.pieceNumber && l.pieceName).map((l) => `${formatPieceNumber(l.pieceNumber!)}, ${l.pieceName}`);
  if (!named.length || !showPromise(PACKED_BY_HAND)) return null;
  return named.length === 1 ? `Wrapped by hand, with a card that reads ${named[0]}.` : `Wrapped by hand, each with its own card: ${named.join("; ")}.`;
}

const rupees = (minor: number) => paiseToRupeesText(minor);

/** schema.org Order, which Gmail may show as an order card above the email. */
function orderLd(order: Order, list: EmailPiece[], lines: Line[], buyerLink: string, status: string) {
  return {
    "@context": "http://schema.org",
    "@type": "Order",
    merchant: { "@type": "Organization", name: "Astitva" },
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    orderStatus: `http://schema.org/${status}`,
    priceCurrency: "INR",
    price: rupees(Number(order.totalMinor)),
    url: buyerLink,
    acceptedOffer: list.map((p, i) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Product", name: p.title, ...(p.url ? { url: p.url } : {}), ...(p.photo ? { image: p.photo } : {}) },
      price: rupees(Number(lines[i]!.item.unitPriceMinor)),
      priceCurrency: "INR",
      eligibleQuantity: { "@type": "QuantitativeValue", value: lines[i]!.item.quantity },
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The emails                                                          */
/* ------------------------------------------------------------------ */

/** Null when there is nothing to send any more (the order is gone). */
export async function renderEmail(db: DbOrTx, template: TemplateName, payload: Record<string, unknown>, ctx: RenderContext): Promise<Rendered | null> {
  const { appUrl } = ctx;

  if (template === "owner_error") {
    const kind = String(payload.kind);
    const message = String(payload.message ?? "No details.");
    const calm = "Nothing was lost: the site keeps going. Check the server logs for the full error, and the order in the admin if one is named.";
    return {
      subject: `Astitva: ${kind} failed`,
      text: textOf("Something failed", [message, calm]),
      html: shell({
        appUrl,
        forOwner: true,
        preheader: `${kind}: ${message}`.slice(0, 140),
        title: "Something failed",
        body: [
          kicker(kind, "left"),
          heading("Something failed", "left"),
          panel("What happened", `<p style="margin:0;font-family:monospace;font-size:13px;line-height:1.6;color:${C.espresso};word-break:break-word">${esc(message)}</p>`, "attention"),
          paragraph(calm, { color: C.soft }),
          button("Open the admin", `${appUrl}/admin`, { align: "left" }),
          clear(),
        ].join(""),
      }),
    };
  }

  const settings = await loadSettings(db);
  const helpLink = settings.whatsapp ? { label: "Message us on WhatsApp", url: whatsappLink(settings.whatsapp, "Hello Astitva, ") } : null;
  const buyerFooter = (extra: { label: string; url: string }[] = []) => [...extra, ...(helpLink ? [helpLink] : []), { label: "astitva.store", url: appUrl }];

  if (template === "back_in_stock") {
    const [v] = await db
      .select({
        color: productVariants.color,
        size: productVariants.size,
        hex: productVariants.colorHex,
        slug: products.slug,
        pieceName: products.pieceName,
        pieceNumber: products.pieceNumber,
        name: products.name,
        tone: products.tone,
        story: products.story,
        price: productVariants.priceMinor,
        photo: sql<string | null>`(
          select ${productImages.url} from ${productImages}
          where ${productImages.productId} = ${products.id} and (${productImages.color} is null or ${productImages.color} = ${productVariants.color})
          order by (${productImages.color} is null), ${productImages.sortOrder}
          limit 1)`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, String(payload.variantId ?? "")));
    if (!v) return null;
    const what = [v.color, v.size].filter(Boolean).join(", ");
    const title = v.pieceName ?? v.name;
    const url = `${appUrl}/pieces/${v.slug}${v.color ? `?colour=${encodeURIComponent(v.color)}` : ""}`;
    const price = formatINR(Number(v.price));
    const lead = `You asked us to tell you: ${title}${what ? ` (${what})` : ""} is back in stock, at ${price}. There are only a few, so it may not stay long.`;
    const once = "This was a one-time note: we won't email you about it again.";
    return {
      subject: `${title}${what ? ` (${what})` : ""} is back`,
      text: textOf(`${title} is back`, [lead, { label: "See it", url }, once]),
      html: shell({
        appUrl,
        preheader: `${what ? `${what}, ` : ""}${price}. Only a few, so it may not stay long.`,
        title: `${title} is back`,
        footerNote: "You asked to hear when this was back. That's the only email we'll send about it.",
        footerLinks: buyerFooter(),
        body: [
          heroPiece({ title, number: null, detail: "", price, photo: v.photo, tone: v.hex ?? v.tone, url }),
          kicker(["Back in stock", v.pieceNumber ? formatPieceNumber(v.pieceNumber) : null].filter(Boolean).join(" · ")),
          heading(`${title} is back`),
          paragraph(`${v.name}${what ? `, in ${what}` : ""}. ${price}.`, { align: "center", color: C.soft }),
          v.story ? quote("Where it came from", v.story, null) : "",
          paragraph("You asked us to tell you. There are only a few, so it may not stay long.", { align: "center" }),
          button(`See ${title}`, url),
          paragraph(once, { size: 12, color: C.soft, align: "center" }),
        ].join(""),
      }),
    };
  }

  const orderId = String(payload.orderId ?? "");
  const loaded = orderId ? await loadOrder(db, orderId) : null;
  if (!loaded) return null;
  const { order, items } = loaded;
  const total = formatINR(Number(order.totalMinor));
  const buyerLink = `${appUrl}${orderPath(order.orderNumber, orderLinkKey(order.id, ctx.linkSecret))}`;
  const adminLink = `${appUrl}/admin/orders/${order.id}`;
  const who = settings.who ?? "We";
  const first = order.contactName.split(/\s+/)[0]!;
  const cod = order.paymentMethod === "cod";
  const list = emailPieces(items, appUrl);
  const { steps, current } = journey(order);
  // Emails come from the team, not one person.
  const signer = "Team Astitva";
  const orderFooterNote = `You're getting this because you ordered from Astitva. Order ${order.orderNumber}.`;

  switch (template) {
    case "order_placed": {
      const lead = cod
        ? `${who} will message you on WhatsApp at ${formatMobile(order.contactPhone)} to confirm your order, then we pack it by hand. You pay ${total} when it arrives.`
        : `We've received your payment of ${total}. We'll pack it by hand and let you know when it's on its way.`;
      const note = noteToShare(items);
      const promise = cardPromise(items);
      return {
        subject: `Your Astitva order ${order.orderNumber}`,
        text: textOf(`Thank you, ${first}.`, [lead, itemLines(items, order), `Going to:\n${addressLines(order.addressSnapshot)}`, { label: "See your order", url: buyerLink }]),
        html: shell({
          appUrl,
          preheader: cod ? `${who === "We" ? "We'll" : `${who} will`} WhatsApp you to confirm, then it's packed by hand.` : `Paid, thank you. ${list.length === 1 ? `${list[0]!.title} is` : "Your pieces are"} being packed by hand.`,
          title: `Thank you, ${first}.`,
          footerLinks: buyerFooter([{ label: "Your order", url: buyerLink }]),
          footerNote: orderFooterNote,
          jsonLd: orderLd(order, list, items, buyerLink, "OrderProcessing"),
          body: [
            mascot(appUrl),
            kicker(`Order ${order.orderNumber}`),
            heading(`Thank you, ${first}.`),
            paragraph(lead, { align: "center" }),
            progress(steps, current),
            pieces(list),
            totals(totalRows(order)),
            note ? quote(`How we'd wear ${note.title}`, note.note, "Team Astitva") : "",
            promise ? paragraph(promise, { align: "center", color: C.soft, size: 14 }) : "",
            columns([
              { title: "Going to", text: addressLines(order.addressSnapshot) },
              { title: "Paying", text: cod ? `Cash on delivery\n${total} when it arrives` : `Paid online\n${total}` },
            ]),
            button("See your order", buyerLink),
            rule(),
            signoff(signer),
          ].join(""),
        }),
      };
    }

    case "order_link": {
      const lead = `You asked for the page for order ${order.orderNumber}. It shows where your order is, and stays private to you.`;
      const ignore = "If you didn't ask for this, you can ignore this email.";
      return {
        subject: `Your Astitva order ${order.orderNumber}`,
        text: textOf("Here's your order", [lead, { label: "See your order", url: buyerLink }, ignore]),
        html: shell({
          appUrl,
          preheader: "The private page for your order, where it shows how it's getting on.",
          title: "Here's your order",
          footerLinks: buyerFooter(),
          footerNote: orderFooterNote,
          body: [
            kicker(`Order ${order.orderNumber}`),
            heading("Here's your order"),
            paragraph(lead, { align: "center" }),
            progress(steps, current),
            pieces(list),
            button("See your order", buyerLink),
            paragraph(ignore, { size: 12, color: C.soft, align: "center" }),
          ].join(""),
        }),
      };
    }

    case "order_shipped": {
      const [s] = await db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.createdAt)).limit(1);
      if (!s) return null;
      const lead = `Your order ${order.orderNumber} has been packed by hand and handed to ${s.carrierName}. Tracking number ${s.trackingNumber}.${cod ? ` Please keep ${total} ready for the courier.` : ""}`;
      const track = s.trackingUrl ? { label: "Track your parcel", url: s.trackingUrl } : { label: "See your order", url: buyerLink };
      const care = careToShare(items);
      const hero = list[0];
      return {
        subject: "Your Astitva order is on its way",
        text: textOf("On its way", [lead, itemLines(items), track]),
        html: shell({
          appUrl,
          preheader: `With ${s.carrierName} now. Tracking number ${s.trackingNumber}.${cod ? ` Keep ${total} ready.` : ""}`,
          title: "On its way",
          footerLinks: buyerFooter([{ label: "Your order", url: buyerLink }]),
          footerNote: orderFooterNote,
          jsonLd: {
            "@context": "http://schema.org",
            "@type": "ParcelDelivery",
            deliveryAddress: {
              "@type": "PostalAddress",
              name: order.addressSnapshot.recipientName,
              streetAddress: [order.addressSnapshot.line1, order.addressSnapshot.line2].filter(Boolean).join(", "),
              addressLocality: order.addressSnapshot.city,
              addressRegion: order.addressSnapshot.state,
              postalCode: order.addressSnapshot.pincode,
              addressCountry: "IN",
            },
            carrier: { "@type": "Organization", name: s.carrierName },
            trackingNumber: s.trackingNumber,
            ...(s.trackingUrl ? { trackingUrl: s.trackingUrl } : {}),
            itemShipped: list.map((p) => ({ "@type": "Product", name: p.title })),
            partOfOrder: { "@type": "Order", orderNumber: order.orderNumber, merchant: { "@type": "Organization", name: "Astitva" }, orderStatus: "http://schema.org/OrderInTransit", url: buyerLink },
          },
          body: [
            hero ? heroPiece(hero) : mascot(appUrl),
            kicker(`Order ${order.orderNumber}`),
            heading("On its way"),
            paragraph(
              `Packed by hand and handed to ${s.carrierName}.${cod ? ` Please keep ${total} ready for the courier.` : ""}`,
              { align: "center" },
            ),
            progress(steps, current),
            panel(
              "Your parcel",
              `<p style="margin:0;font-size:14px;color:${C.soft};font-family:Helvetica,Arial,sans-serif">${esc(s.carrierName)}</p>
<p style="margin:4px 0 0;font-family:'Courier New',monospace;font-size:20px;letter-spacing:.06em;color:${C.espresso}">${esc(s.trackingNumber)}</p>`,
            ),
            button(track.label, track.url),
            pieces(list),
            care ? panel(`Caring for ${care.title}`, paragraph(care.care).replace("margin:0 0 16px", "margin:0")) : "",
            rule(),
            signoff(signer),
          ].join(""),
        }),
      };
    }

    case "refund_succeeded": {
      const [r] = await db.select().from(refunds).where(eq(refunds.id, String(payload.refundId ?? "")));
      if (!r) return null;
      const amount = formatINR(Number(r.amountMinor));
      const how =
        r.method === "razorpay"
          ? `${amount} is on its way back to the card or UPI account you paid with. Banks usually take 5–7 working days to show it.`
          : `${amount} has been sent to you by ${r.method === "manual_upi" ? "UPI" : "bank transfer"}.`;
      const reply = "If anything doesn't look right, just reply on WhatsApp.";
      return {
        subject: `Your refund for ${order.orderNumber}`,
        text: textOf(`We've refunded ${amount}`, [how, reply, { label: "See your order", url: buyerLink }]),
        html: shell({
          appUrl,
          preheader: r.method === "razorpay" ? `On its way back to how you paid. Banks take 5–7 working days.` : `Sent by ${r.method === "manual_upi" ? "UPI" : "bank transfer"}.`,
          title: `We've refunded ${amount}`,
          footerLinks: buyerFooter([{ label: "Your order", url: buyerLink }]),
          footerNote: orderFooterNote,
          body: [
            kicker(`Order ${order.orderNumber}`),
            heading(`We've refunded ${amount}`),
            paragraph(how, { align: "center" }),
            totals([
              ["Refunded", amount],
              ["How", r.method === "razorpay" ? "Back to how you paid" : r.method === "manual_upi" ? "UPI" : "Bank transfer"],
              ...(r.providerRefundId ? ([["Reference", r.providerRefundId]] as [string, string][]) : []),
              ["Order total", total],
            ]),
            paragraph(reply, { align: "center", color: C.soft }),
            button("See your order", buyerLink, { tone: "outline" }),
            rule(),
            signoff(signer),
          ].join(""),
        }),
      };
    }

    case "owner_new_order": {
      const how = cod ? `Cash on delivery, ${total}. Confirm with the buyer on WhatsApp before packing.` : `Paid online, ${total}. Ready to pack.`;
      const itemsText = items.map((l) => `${l.item.productNameSnapshot}${variantText(l.item) ? ` (${variantText(l.item)})` : ""}${l.item.quantity > 1 ? ` × ${l.item.quantity}` : ""}`).join("; ");
      const a = order.addressSnapshot;
      // The same message the admin's order page prepares, one tap from the email.
      const confirm = `Hello ${first}, this is Astitva. Thank you for order ${order.orderNumber}: ${itemsText}. It comes to ${total}, to pay on delivery, and goes to ${a.city} ${a.pincode}. Shall we pack it?`;
      return {
        subject: `New order ${order.orderNumber} · ${total} · ${cod ? "cash on delivery" : "paid online"}`,
        text: textOf(`New order from ${first}`, [
          `${order.contactName}, ${a.city} · ${formatMobile(order.contactPhone)}`,
          itemLines(items, order),
          how,
          order.customerNote ? `Their note: ${order.customerNote}` : null,
          { label: "Open the order", url: adminLink },
        ]),
        html: shell({
          appUrl,
          forOwner: true,
          preheader: `${order.contactName}, ${a.city}. ${cod ? "Cash on delivery: confirm on WhatsApp first." : "Paid online: ready to pack."}`,
          title: `New order from ${first}`,
          footerLinks: [{ label: "Today in the admin", url: `${appUrl}/admin` }],
          body: [
            kicker(`New order · ${order.orderNumber}`, "left"),
            heading(`${total} from ${first}`, "left"),
            paragraph(`${order.contactName}, ${a.city} · ${formatMobile(order.contactPhone)}`, { color: C.soft }),
            panel(cod ? "Cash on delivery" : "Paid online", paragraph(how).replace("margin:0 0 16px", "margin:0"), cod ? "attention" : "ivory"),
            order.customerNote ? quote("Their note", order.customerNote, null) : "",
            pieces(list),
            totals(totalRows(order)),
            columns([
              { title: "Going to", text: addressLines(a) },
              { title: "Reach them", text: `${formatMobile(order.contactPhone)}${order.contactEmail ? `\n${order.contactEmail}` : ""}` },
            ]),
            cod ? button("Confirm on WhatsApp", whatsappLink(`91${order.contactPhone}`, confirm), { align: "left" }) : "",
            button("Open the order", adminLink, { tone: cod ? "outline" : "primary", align: "left" }),
            clear(),
          ].join(""),
        }),
      };
    }

    case "owner_needs_you": {
      const why = order.resolutionNote ?? "An order was flagged.";
      return {
        subject: `Needs you: ${order.orderNumber}`,
        text: textOf("An order needs you", [why, `${order.contactName} · ${formatMobile(order.contactPhone)} · ${total}`, { label: "Open the order", url: adminLink }]),
        html: shell({
          appUrl,
          forOwner: true,
          preheader: why.slice(0, 140),
          title: "An order needs you",
          body: [
            kicker(`Needs you · ${order.orderNumber}`, "left"),
            heading("An order needs you", "left"),
            panel("Why", paragraph(why).replace("margin:0 0 16px", "margin:0"), "attention"),
            paragraph(`${order.contactName} · ${formatMobile(order.contactPhone)} · ${total}`, { color: C.soft }),
            pieces(list),
            button("Message them on WhatsApp", whatsappLink(`91${order.contactPhone}`, `Hello ${first}, this is Astitva, about your order ${order.orderNumber}.`), { align: "left" }),
            button("Open the order", adminLink, { tone: "outline", align: "left" }),
            clear(),
          ].join(""),
        }),
      };
    }
  }
}

/** The admin's "set your password" email (sent straight away, not through the outbox). */
export function renderPasswordReset({ name, url, appUrl }: { name: string; url: string; appUrl: string }): Rendered {
  const lead = "Use this link within an hour to set your password for the Astitva admin:";
  const ignore = "If you didn't ask for this, ignore this email; nothing changes.";
  return {
    subject: "Set your Astitva password",
    text: `Hello ${name},\n\n${lead}\n\n${url}\n\n${ignore}\n`,
    html: shell({
      appUrl,
      forOwner: true,
      preheader: "The link works for an hour.",
      title: "Set your password",
      body: [
        kicker("The admin", "left"),
        heading(`Hello ${name}`, "left"),
        paragraph("Use the button within an hour to set your password for the Astitva admin. You'll then set up the six-digit code from your authenticator app."),
        button("Set my password", url, { align: "left" }),
        clear(),
        paragraph(ignore, { size: 12, color: C.soft }),
      ].join(""),
    }),
  };
}

/** The 6-digit code for signing in to an account. The code is in the subject, so a notification shows it. */
export function renderSignInCode({ otp, minutes, appUrl }: { otp: string; minutes: number; appUrl: string }): Rendered {
  const lead = `Here's your code for signing in to Astitva. It works for ${minutes} minutes.`;
  const ignore = "If you didn't ask for it, you can ignore this email: no one can sign in without the code.";
  return {
    subject: `${otp} is your Astitva sign-in code`,
    text: `${lead}\n\n${otp}\n\n${ignore}\n\nTeam Astitva\n`,
    html: shell({
      appUrl,
      preheader: `It works for ${minutes} minutes.`,
      title: "Your sign-in code",
      body: [
        kicker("Signing in"),
        heading("Your code"),
        paragraph(lead, { align: "center" }),
        code(otp),
        paragraph(ignore, { size: 12, color: C.soft, align: "center" }),
      ].join(""),
      footerNote: "You asked to sign in to your account at Astitva.",
    }),
  };
}
