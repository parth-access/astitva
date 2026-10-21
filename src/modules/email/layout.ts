/**
 * The look of every Astitva email: a letter on paper, not a receipt. Built
 * the way mail apps need it: tables for layout, styles inline, no scripts,
 * no SVG, nothing that needs web fonts (Apple Mail gets Playfair and
 * Montserrat; Gmail and Outlook fall back to Georgia and Helvetica).
 * Every block returns an HTML string; `esc` everything that came from a
 * person or the database.
 */
import { inkOn, normaliseTone } from "@/lib/tone";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The brand palette (src/app/globals.css), as mail apps need it: plain hex. */
export const C = {
  ivory: "#f7f1e7",
  paper: "#fdfaf5",
  champagne: "#efe3cc",
  sand: "#e3d2b9",
  taupe: "#a39282",
  olive: "#56573a",
  burgundy: "#6a1d2b",
  espresso: "#34251e",
  soft: "#66554a",
};

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const ARCH = "border-radius:999px 999px 0 0";

/** A Cloudinary photo cut to an exact size, as JPEG (Outlook can't show WebP or AVIF). Anything else unchanged. */
export function emailImage(url: string, w: number, h: number): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url);
  return m ? `${m[1]}c_fill,g_auto,w_${w * 2},h_${h * 2},q_auto,f_jpg/${m[2]}` : url;
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

export function paragraph(text: string, opts: { size?: number; color?: string; align?: "left" | "center" } = {}) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:${opts.size ?? 15}px;line-height:1.65;color:${opts.color ?? C.espresso};text-align:${opts.align ?? "left"}">${esc(text).replace(/\n/g, "<br>")}</p>`;
}

/** Small capitals above a heading: "ORDER AST-001005". */
export function kicker(text: string, align: "left" | "center" = "center") {
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${C.soft};text-align:${align}">${esc(text)}</p>`;
}

export function heading(text: string, align: "left" | "center" = "center") {
  return `<h1 class="h1" style="margin:0 0 18px;font-family:${SERIF};font-style:italic;font-weight:400;font-size:38px;line-height:1.12;color:${C.espresso};text-align:${align}">${esc(text)}</h1>`;
}

export function spacer(h: number) {
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px">&#8202;</div>`;
}

export function rule() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0 24px"><div style="height:1px;background:${C.sand};line-height:1px;font-size:1px">&#8202;</div></td></tr></table>`;
}

/** A button that works in every mail app (a padded link in a coloured cell). */
export function button(label: string, url: string, opts: { tone?: "primary" | "outline"; align?: "left" | "center" } = {}) {
  const primary = (opts.tone ?? "primary") === "primary";
  const cell = primary ? `background:${C.burgundy};` : `border:1px solid ${C.espresso};`;
  const left = opts.align === "left";
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="${left ? "left" : "center"}" style="margin:${left ? "8px 12px 16px 0" : "8px auto 24px"}"><tr><td style="${cell}border-radius:999px">
<a href="${esc(url)}" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:14px;font-weight:500;letter-spacing:.04em;color:${primary ? C.ivory : C.espresso};text-decoration:none;border-radius:999px">${esc(label)}</a>
</td></tr></table>`;
}

/** Ends a row of left-aligned buttons (which sit side by side). */
export function clear() {
  return `<div style="clear:both;height:1px;line-height:1px;font-size:1px">&#8202;</div>`;
}

/** The mascot in an arch, at the head of a buyer's letter. */
export function mascot(appUrl: string) {
  // The drawing is padded with its own paper (public/email/mascot.jpg), so the arch clips paper, never the hat.
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 28px"><tr><td style="background:#ede2d0;${ARCH};padding:0">
<img src="${esc(appUrl)}/email/mascot.jpg" width="160" height="171" alt="" style="display:block;width:160px;height:171px;${ARCH};border:0">
</td></tr></table>`;
}

export type EmailPiece = {
  title: string;
  /** "Nº 01", or null before the piece has a number. */
  number: string | null;
  detail: string;
  price: string;
  photo: string | null;
  tone: string | null;
  url: string | null;
};

/** A piece in its arch: the photo, or its colour with its name painted on. */
export function arch(p: Pick<EmailPiece, "title" | "photo" | "tone">, w: number, h: number) {
  if (p.photo) {
    return `<img src="${esc(emailImage(p.photo, w, h))}" width="${w}" height="${h}" alt="${esc(p.title)}" style="display:block;width:${w}px;height:${h}px;${ARCH};border:0;background:${normaliseTone(p.tone)}">`;
  }
  const bg = normaliseTone(p.tone);
  const ink = inkOn(bg) === "light" ? C.ivory : C.espresso;
  const size = Math.max(13, Math.round(w / 6));
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="${w}"><tr><td width="${w}" height="${h}" style="width:${w}px;height:${h}px;background:${bg};${ARCH};text-align:center;vertical-align:middle;font-family:${SERIF};font-style:italic;font-size:${size}px;color:${ink}">${esc(p.title)}</td></tr></table>`;
}

/** One large piece, centred: the hero of a shipping or back-in-stock email. */
export function heroPiece(p: EmailPiece) {
  const img = arch(p, 220, 275);
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 28px"><tr><td>${p.url ? `<a href="${esc(p.url)}" style="text-decoration:none">${img}</a>` : img}</td></tr></table>`;
}

/** The pieces of an order, each in a small arch, with its number, name, colour and size. */
export function pieces(list: EmailPiece[]) {
  const rows = list
    .map(
      (p) => `<tr>
<td width="76" valign="top" style="padding:0 16px 18px 0">${arch(p, 72, 90)}</td>
<td valign="middle" style="padding:0 0 18px;font-family:${SANS};font-size:14px;line-height:1.5;color:${C.espresso}">
${p.number ? `<span style="font-family:${SERIF};font-size:13px;color:${C.soft}">${esc(p.number)}</span><br>` : ""}
<span style="font-family:${SERIF};font-style:italic;font-size:21px;line-height:1.25">${p.url ? `<a href="${esc(p.url)}" style="color:${C.espresso};text-decoration:none">${esc(p.title)}</a>` : esc(p.title)}</span><br>
<span style="color:${C.soft};font-size:13px">${esc(p.detail)}</span>
</td>
<td valign="middle" align="right" style="padding:0 0 18px 12px;font-family:${SANS};font-size:14px;color:${C.espresso};white-space:nowrap">${esc(p.price)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px">${rows}</table>`;
}

/** Subtotal, discount, shipping, total: a soft panel. The last row is the total. */
export function totals(rows: [string, string][]) {
  const body = rows
    .map(([k, v], i) => {
      const last = i === rows.length - 1;
      const style = last
        ? `padding:12px 0 0;border-top:1px solid ${C.sand};font-weight:600;font-size:15px`
        : `padding:0 0 6px;color:${C.soft};font-size:14px`;
      return `<tr><td style="font-family:${SANS};${style}">${esc(k)}</td><td align="right" style="font-family:${SANS};${style};${last ? "" : `color:${C.espresso}`}">${esc(v)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:${C.ivory};border-radius:12px"><tr><td style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/**
 * Where the order is, as a bar of segments: done in olive, the current step
 * in burgundy, the rest in sand. Each step's name sits under its segment.
 */
export function progress(steps: string[], current: number) {
  const w = Math.floor(100 / steps.length);
  const cells = steps
    .map((s, i) => {
      const colour = i < current ? C.olive : i === current ? C.burgundy : C.sand;
      const label = i === current ? `color:${C.burgundy};font-weight:600` : i < current ? `color:${C.espresso}` : `color:${C.taupe}`;
      return `<td width="${w}%" valign="top" style="padding:0 3px">
<div style="height:4px;line-height:4px;font-size:1px;background:${colour};border-radius:4px">&#8202;</div>
<p style="margin:8px 0 0;font-family:${SANS};font-size:11px;line-height:1.3;text-align:center;${label}">${i < current ? "&#10003;&nbsp;" : ""}${esc(s)}</p>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 32px"><tr>${cells}</tr></table>`;
}

/** Krishna's words about a piece, set like a pull quote, signed. */
export function quote(label: string, text: string, signature: string | null) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td style="background:${C.champagne};border-radius:16px;padding:26px 28px;text-align:center">
<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.soft}">${esc(label)}</p>
<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:20px;line-height:1.5;color:${C.espresso}">&ldquo;${esc(text)}&rdquo;</p>
${signature ? `<p style="margin:14px 0 0;font-family:${SERIF};font-style:italic;font-size:17px;color:${C.burgundy}">&mdash; ${esc(signature)}</p>` : ""}
</td></tr></table>`;
}

/** A quiet panel with a title: tracking details, care, a refund. */
export function panel(title: string, inner: string, tone: "ivory" | "attention" = "ivory") {
  const border = tone === "attention" ? `border-left:4px solid ${C.burgundy};` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td style="background:${C.ivory};${border}border-radius:12px;padding:20px 22px">
<p style="margin:0 0 8px;font-family:${SANS};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.soft}">${esc(title)}</p>
${inner}
</td></tr></table>`;
}

/** Two columns that stack on a phone (each is an inline block with a minimum width). */
export function columns(cols: { title: string; text: string }[]) {
  const col = (c: { title: string; text: string }) => `<div class="stack" style="display:inline-block;vertical-align:top;width:100%;max-width:240px;margin:0 0 20px">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${C.soft}">${esc(c.title)}</p>
<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.espresso}">${esc(c.text).replace(/\n/g, "<br>")}</p>
</div>`;
  return `<div style="margin:0 0 12px;font-size:0">${cols.map(col).join(`<div class="stack" style="display:inline-block;width:20px"></div>`)}</div>`;
}

/** The handwritten-feeling close of a buyer's letter. */
export function signoff(name: string) {
  return `<p style="margin:8px 0 0;font-family:${SANS};font-size:14px;color:${C.soft}">With love,</p>
<p style="margin:2px 0 0;font-family:${SERIF};font-style:italic;font-size:26px;color:${C.burgundy}">${esc(name)}</p>`;
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export type Shell = {
  appUrl: string;
  /** The line inboxes show after the subject. */
  preheader: string;
  title: string;
  body: string;
  /** Links in the footer. */
  footerLinks?: { label: string; url: string }[];
  /** Why they got it, in the footer. */
  footerNote?: string;
  /** schema.org markup for Gmail's order and parcel cards. */
  jsonLd?: object;
  /** Krishna's own emails: no masthead flourish, a plain footer. */
  forOwner?: boolean;
};

/** JSON inside a script tag can't contain "</script>": escape "<". */
const jsonForScript = (o: object) => JSON.stringify(o).replace(/</g, "\\u003c");

export function shell(s: Shell) {
  const font = (file: string, family: string, style: string, weight: number) =>
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(${s.appUrl}/email/fonts/${file}) format('woff')}`;
  // Pads the preview so the inbox doesn't pull in the first lines of the body.
  const previewPad = "&#847;&zwnj;&nbsp;".repeat(60);
  const links = (s.footerLinks ?? [])
    .map((l) => `<a href="${esc(l.url)}" style="color:${C.soft};text-decoration:underline">${esc(l.label)}</a>`)
    .join(`&nbsp;&nbsp;&middot;&nbsp;&nbsp;`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(s.title)}</title>
<style>
${font("playfair-display-latin-400-normal.woff", "Playfair Display", "normal", 400)}
${font("playfair-display-latin-400-italic.woff", "Playfair Display", "italic", 400)}
${font("montserrat-latin-400-normal.woff", "Montserrat", "normal", 400)}
${font("montserrat-latin-500-normal.woff", "Montserrat", "normal", 500)}
:root{color-scheme:light only;supported-color-schemes:light only}
body{margin:0;padding:0;background:${C.ivory};-webkit-text-size-adjust:100%}
a{color:${C.burgundy}}
@media (max-width:620px){
.card{border-radius:0 !important;border-left:0 !important;border-right:0 !important}
.pad{padding-left:22px !important;padding-right:22px !important}
.h1{font-size:32px !important}
.stack{display:block !important;max-width:100% !important}
}
</style>
${s.jsonLd ? `<script type="application/ld+json">${jsonForScript(s.jsonLd)}</script>` : ""}
</head>
<body style="margin:0;padding:0;background:${C.ivory}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.ivory}">${esc(s.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory}">
<tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding:0 0 26px">
<a href="${esc(s.appUrl)}" style="text-decoration:none;color:${C.espresso}">
<span style="font-family:${SERIF};font-size:22px;letter-spacing:.42em;color:${C.espresso}">ASTITVA</span><br>
<span style="font-family:${SERIF};font-style:italic;font-size:13px;color:${C.soft}">${s.forOwner ? "admin" : "Your true form"}</span>
</a>
</td></tr>
<tr><td class="card pad" style="background:${C.paper};border:1px solid ${C.sand};border-radius:20px;padding:44px 44px 36px">
${s.body}
</td></tr>
<tr><td align="center" style="padding:28px 24px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.soft}">
${links ? `<p style="margin:0 0 10px">${links}</p>` : ""}
${s.footerNote ? `<p style="margin:0 0 10px">${esc(s.footerNote)}</p>` : ""}
<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:13px">Astitva &middot; Your true form</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
