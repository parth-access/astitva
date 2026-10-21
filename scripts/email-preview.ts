/**
 * Renders every email from the local database into .email-preview/, with an
 * index page, so they can be looked at in a browser before they're sent:
 *
 *   npm run email:preview
 *   open .email-preview/index.html
 *
 * Uses the newest order (and the newest shipped and refunded ones) in
 * DATABASE_URL. Nothing is sent and nothing is written to the database.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { desc, eq, isNotNull } from "drizzle-orm";
import { createDb } from "../src/db/create";
import { orders, productVariants, refunds, shipments } from "../src/db/schema";
import { renderEmail, renderPasswordReset, type TemplateName } from "../src/modules/email/templates";

const OUT = ".email-preview";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const ctx = { appUrl, linkSecret: process.env.BETTER_AUTH_SECRET || "preview".repeat(6) };
  const db = createDb(url, { max: 1 });
  try {
    const [latest] = await db.select({ id: orders.id }).from(orders).orderBy(desc(orders.createdAt)).limit(1);
    const [shipped] = await db.select({ id: shipments.orderId }).from(shipments).orderBy(desc(shipments.createdAt)).limit(1);
    const [refund] = await db.select({ id: refunds.id, orderId: refunds.orderId }).from(refunds).where(eq(refunds.status, "succeeded")).orderBy(desc(refunds.createdAt)).limit(1);
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).where(isNotNull(productVariants.color)).limit(1);

    const jobs: [string, TemplateName, Record<string, unknown> | null][] = [
      ["Order placed", "order_placed", latest ? { orderId: latest.id } : null],
      ["Your order page", "order_link", latest ? { orderId: latest.id } : null],
      ["On its way", "order_shipped", shipped ? { orderId: shipped.id } : null],
      ["Refunded", "refund_succeeded", refund ? { orderId: refund.orderId, refundId: refund.id } : null],
      ["Back in stock", "back_in_stock", variant ? { variantId: variant.id } : null],
      ["Owner: new order", "owner_new_order", latest ? { orderId: latest.id } : null],
      ["Owner: needs you", "owner_needs_you", latest ? { orderId: latest.id } : null],
      ["Owner: something failed", "owner_error", { kind: "Razorpay webhook", message: "Event evt_123 (payment.captured): Razorpay couldn't be reached." }],
    ];

    mkdirSync(OUT, { recursive: true });
    const made: { file: string; label: string; subject: string }[] = [];
    for (const [label, template, payload] of jobs) {
      if (!payload) {
        console.log(`skipped ${label}: nothing in the database to show it with`);
        continue;
      }
      const email = await renderEmail(db, template, payload, ctx);
      if (!email?.html) continue;
      writeFileSync(`${OUT}/${template}.html`, email.html);
      writeFileSync(`${OUT}/${template}.txt`, `Subject: ${email.subject}\n\n${email.text}`);
      made.push({ file: `${template}.html`, label, subject: email.subject });
    }
    const reset = renderPasswordReset({ name: "Krishna", url: `${appUrl}/admin/reset-password?token=preview`, appUrl });
    writeFileSync(`${OUT}/password_reset.html`, reset.html!);
    made.push({ file: "password_reset.html", label: "Set your password", subject: reset.subject });

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    writeFileSync(
      `${OUT}/index.html`,
      `<!doctype html><meta charset="utf-8"><title>Astitva emails</title><body style="font-family:system-ui;margin:2rem;background:#eee">
<h1>Astitva emails</h1>
${made.map((m) => `<section style="margin:2rem 0"><h2 style="margin:0">${esc(m.label)}</h2><p style="margin:.25rem 0 1rem;color:#555">Subject: ${esc(m.subject)}</p>
<div style="display:flex;gap:2rem;flex-wrap:wrap"><iframe src="${m.file}" style="width:680px;height:900px;border:1px solid #ccc;background:#fff"></iframe><iframe src="${m.file}" style="width:375px;height:900px;border:1px solid #ccc;background:#fff"></iframe></div></section>`).join("")}
</body>`,
    );
    console.log(`Wrote ${made.length} emails to ${OUT}/ (open index.html).`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
