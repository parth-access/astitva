import { revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { alertError } from "@/modules/email/outbox";
import { sendQueuedEmailsSoon } from "@/modules/email/soon";
import { isWebhookSignature } from "@/modules/payments/razorpay";
import { handleWebhook } from "@/modules/payments/service";

/**
 * Razorpay → us. Set this URL in Razorpay's dashboard (Settings → Webhooks)
 * with events payment.captured, payment.failed, order.paid, refund.processed
 * and refund.failed, and the same
 * secret as RAZORPAY_WEBHOOK_SECRET.
 *
 * The signature is checked over the raw body before anything is parsed. A
 * non-2xx reply makes Razorpay retry, so we only fail when processing failed.
 */
export async function POST(request: Request) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhooks are not configured" }, { status: 503 });

  const raw = await request.text();
  if (!isWebhookSignature(raw, request.headers.get("x-razorpay-signature"), secret)) {
    return Response.json({ error: "Bad signature" }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId) return Response.json({ error: "Missing event id" }, { status: 400 });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  try {
    const result = await handleWebhook(db, eventId.slice(0, 96), body);
    // A captured payment turned a hold into a sale: the shop's counts follow.
    if (result === "processed") revalidateTag(CATALOG_TAG, "max");
    sendQueuedEmailsSoon();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[razorpay webhook]", eventId, (err as Error).message);
    await alertError(db, "Razorpay webhook", `Event ${eventId} (${String(body?.event)}): ${(err as Error).message}`).catch(() => {});
    sendQueuedEmailsSoon();
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
