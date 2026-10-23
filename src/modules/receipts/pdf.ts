/**
 * The receipt as an A4 PDF: attached to the confirmation email and
 * downloadable from the order page. Plain and printable, in the brand's
 * colours and fonts (Montserrat, with Playfair for the title and for the
 * rupee sign, which the Latin Montserrat subset lacks).
 *
 * Fonts are read from src/fonts/og, as the share cards read them.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatLongDate } from "@/lib/format";
import { formatMobile } from "@/lib/india";
import { formatINR } from "@/lib/money";
import { paidWithLabel, statusLine, type ReceiptView } from "./service";

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const ESPRESSO = hex("#34251e");
const SOFT = hex("#66554a");
const TAUPE = hex("#a39282");
const CHAMPAGNE = hex("#efe3cc");
const BURGUNDY = hex("#6a1d2b");
const OLIVE = hex("#56573a");

const font = (file: string) => readFile(join(process.cwd(), "src/fonts/og", file));

type Fonts = { regular: PDFFont; medium: PDFFont; display: PDFFont; fallback: PDFFont };
type Style = { size?: number; font?: keyof Fonts; color?: ReturnType<typeof rgb>; align?: "left" | "right" };

/** Draws text in runs: characters the main font lacks (₹, accented Latin) come from the fallback, anything else becomes "?". */
class Writer {
  private sets = new Map<PDFFont, Set<number>>();
  constructor(
    public page: PDFPage,
    private fonts: Fonts,
  ) {}

  private has(f: PDFFont, cp: number) {
    let set = this.sets.get(f);
    if (!set) this.sets.set(f, (set = new Set(f.getCharacterSet())));
    return set.has(cp);
  }

  private runs(text: string, main: PDFFont): { text: string; font: PDFFont }[] {
    const out: { text: string; font: PDFFont }[] = [];
    for (const ch of text.replace(/\s+/g, " ")) {
      const cp = ch.codePointAt(0)!;
      const [f, c] = this.has(main, cp) ? [main, ch] : this.has(this.fonts.fallback, cp) ? [this.fonts.fallback, ch] : [main, "?"];
      const last = out[out.length - 1];
      if (last && last.font === f) last.text += c;
      else out.push({ text: c, font: f });
    }
    return out;
  }

  width(text: string, s: Style = {}) {
    const size = s.size ?? 10;
    return this.runs(text, this.fonts[s.font ?? "regular"]).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  }

  /** Shortens with "…" to fit `max` points. */
  fit(text: string, max: number, s: Style = {}) {
    if (this.width(text, s) <= max) return text;
    let t = text;
    while (t.length > 1 && this.width(`${t}…`, s) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  text(text: string, x: number, y: number, s: Style = {}) {
    const size = s.size ?? 10;
    let at = s.align === "right" ? x - this.width(text, s) : x;
    for (const r of this.runs(text, this.fonts[s.font ?? "regular"])) {
      this.page.drawText(r.text, { x: at, y, size, font: r.font, color: s.color ?? ESPRESSO });
      at += r.font.widthOfTextAtSize(r.text, size);
    }
  }

  rule(x1: number, x2: number, y: number, color = TAUPE, thickness = 0.5) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }
}

/** The receipt as PDF bytes. */
export async function renderReceiptPdf(v: ReceiptView, appUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Astitva receipt ${v.receiptNumber}`);
  doc.setAuthor("Astitva");
  doc.setSubject(`Receipt for order ${v.order.orderNumber}`);
  doc.setCreationDate(v.issuedAt);

  const [regular, medium, display, fallback] = await Promise.all([
    font("montserrat-latin-400-normal.woff"),
    font("montserrat-latin-500-normal.woff"),
    font("playfair-display-latin-400-italic.woff"),
    font("playfair-display-latin-ext-400-normal.woff"),
  ]);
  const fonts: Fonts = {
    regular: await doc.embedFont(regular, { subset: true }),
    medium: await doc.embedFont(medium, { subset: true }),
    display: await doc.embedFont(display, { subset: true }),
    fallback: await doc.embedFont(fallback, { subset: true }),
  };

  const A4: [number, number] = [595.28, 841.89];
  const w = new Writer(doc.addPage(A4), fonts);
  const L = 56;
  const R = 595.28 - 56;
  const o = v.order;
  let y = 841.89 - 64;

  // Masthead.
  w.text("A S T I T V A", L, y, { size: 20, font: "display" });
  w.text("Receipt", R, y + 2, { size: 18, font: "display", align: "right" });
  y -= 18;
  w.text("Your true form", L, y, { size: 9, font: "display", color: SOFT });
  w.text(v.receiptNumber, R, y, { size: 10, font: "medium", align: "right" });
  y -= 22;
  w.text("Payment receipt, not a tax invoice. Prices include all taxes.", L, y, { size: 8.5, color: SOFT });
  y -= 14;
  w.rule(L, R, y);

  // Numbers and dates.
  y -= 22;
  const meta: [string, string][] = [
    ["Receipt", v.receiptNumber],
    ["Issued", formatLongDate(v.issuedAt)],
    ["Order", o.orderNumber],
    ["Placed", formatLongDate(new Date(o.placedAt))],
  ];
  const colW = (R - L) / 4;
  meta.forEach(([label, value], i) => {
    w.text(label.toUpperCase(), L + i * colW, y, { size: 7.5, color: SOFT });
    w.text(value, L + i * colW, y - 14, { size: 10, font: "medium" });
  });
  y -= 44;

  // Who and where.
  const a = o.address;
  const billed = [o.buyer.name, formatMobile(o.buyer.phone), o.buyer.email].filter((l): l is string => Boolean(l));
  const sent = [a.recipientName, a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : null, `${a.city}, ${a.state} ${a.pincode}`].filter((l): l is string => Boolean(l));
  const half = (R - L) / 2;
  w.text("BILLED TO", L, y, { size: 7.5, color: SOFT });
  w.text("DELIVERED TO", L + half, y, { size: 7.5, color: SOFT });
  const lines = Math.max(billed.length, sent.length);
  for (let i = 0; i < lines; i++) {
    const ly = y - 15 - i * 13;
    if (billed[i]) w.text(w.fit(billed[i]!, half - 16), L, ly, { size: 9.5 });
    if (sent[i]) w.text(w.fit(sent[i]!, half - 4), L + half, ly, { size: 9.5 });
  }
  y -= 15 + lines * 13 + 18;

  // The pieces.
  const qtyX = R - 170;
  const priceX = R - 90;
  w.page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 20, color: CHAMPAGNE });
  w.text("PIECE", L + 8, y, { size: 7.5, font: "medium" });
  w.text("QTY", qtyX, y, { size: 7.5, font: "medium", align: "right" });
  w.text("PRICE", priceX, y, { size: 7.5, font: "medium", align: "right" });
  w.text("AMOUNT", R - 8, y, { size: 7.5, font: "medium", align: "right" });
  y -= 24;
  for (const item of o.items) {
    // A long order carries on over the page, leaving room for the footer.
    if (y < 110) {
      w.page = doc.addPage(A4);
      y = A4[1] - 64;
      w.text(`${v.receiptNumber}, continued`, L, y, { size: 9, color: SOFT });
      y -= 28;
    }
    const detail = [item.variant.color, item.variant.size].filter(Boolean).join(" · ");
    w.text(w.fit(item.name, qtyX - L - 48, { size: 10, font: "medium" }), L + 8, y, { size: 10, font: "medium" });
    w.text(String(item.quantity), qtyX, y, { size: 10, align: "right" });
    w.text(formatINR(item.unitPriceMinor), priceX, y, { size: 10, align: "right" });
    w.text(formatINR(item.unitPriceMinor * item.quantity), R - 8, y, { size: 10, align: "right" });
    if (detail) {
      y -= 12;
      w.text(w.fit(detail, qtyX - L - 48, { size: 8.5 }), L + 8, y, { size: 8.5, color: SOFT });
    }
    y -= 10;
    w.rule(L, R, y, CHAMPAGNE);
    y -= 16;
  }

  // Totals and payment stay together: a new page if they don't fit.
  if (y < 330) {
    w.page = doc.addPage(A4);
    y = A4[1] - 64;
    w.text(`${v.receiptNumber}, continued`, L, y, { size: 9, color: SOFT });
    y -= 28;
  }
  const rows: [string, string, ReturnType<typeof rgb>?][] = [["Subtotal", formatINR(o.subtotalMinor)]];
  if (o.discountMinor) rows.push([`Discount${o.discountCode ? ` (${o.discountCode})` : ""}`, `−${formatINR(o.discountMinor)}`, OLIVE]);
  rows.push(["Delivery", o.shippingMinor ? formatINR(o.shippingMinor) : "Free"]);
  if (o.codFeeMinor) rows.push(["Cash on delivery fee", formatINR(o.codFeeMinor)]);
  const labelX = R - 200;
  for (const [label, value, color] of rows) {
    w.text(label, labelX, y, { size: 9.5, color: color ?? SOFT });
    w.text(value, R - 8, y, { size: 9.5, align: "right", color: color ?? ESPRESSO });
    y -= 16;
  }
  w.rule(labelX, R, y + 6);
  y -= 12;
  const due = v.status.kind === "due_on_delivery";
  w.text(due ? "To pay on delivery" : "Total", labelX, y, { size: 10.5, font: "medium" });
  w.text(formatINR(v.amountMinor), R - 8, y - 1, { size: 16, font: "display", align: "right" });
  y -= 20;
  for (const r of v.refunds) {
    w.text(r.status === "succeeded" ? `Refunded, ${formatLongDate(r.at)}` : "Refund on its way", labelX, y, { size: 9.5, color: SOFT });
    w.text(`−${formatINR(r.amountMinor)}`, R - 8, y, { size: 9.5, align: "right", color: SOFT });
    y -= 16;
  }

  // Payment.
  y -= 18;
  const s = v.status;
  const facts: [string, string][] =
    s.kind === "paid_online"
      ? [
          ["Paid with", `${paidWithLabel(s.paidWith)}, through Razorpay`],
          ["Paid on", formatLongDate(s.paidAt)],
          ["Payment reference", s.reference],
        ]
      : [["Payment", s.kind === "paid_on_delivery" ? "Cash on delivery, paid to the courier" : "Cash on delivery: cash or UPI to the courier"]];
  const boxH = 30 + facts.length * 15;
  w.page.drawRectangle({ x: L, y: y - boxH + 14, width: R - L, height: boxH, borderColor: s.kind === "not_collected" ? BURGUNDY : TAUPE, borderWidth: 0.75 });
  w.text(statusLine(v), L + 14, y - 4, { size: 10.5, font: "medium", color: s.kind === "not_collected" ? BURGUNDY : ESPRESSO });
  facts.forEach(([label, value], i) => {
    const fy = y - 22 - i * 15;
    w.text(label, L + 14, fy, { size: 9, color: SOFT });
    w.text(value, L + 130, fy, { size: 9 });
  });
  y -= boxH + 24;

  w.text("Thank you for choosing Astitva. Every piece is packed by hand.", L, y, { size: 9.5, font: "display", color: SOFT });

  // Footer.
  const site = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const contact = [site, v.shop.email, v.shop.whatsapp ? `WhatsApp +${v.shop.whatsapp}` : null].filter(Boolean).join("   ·   ");
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    w.page = p;
    w.rule(L, R, 64);
    w.text(contact, L, 48, { size: 8, color: SOFT });
    w.text(`${v.receiptNumber}${pages.length > 1 ? ` · page ${i + 1} of ${pages.length}` : ""}`, R, 48, { size: 8, color: TAUPE, align: "right" });
  });

  return doc.save();
}
