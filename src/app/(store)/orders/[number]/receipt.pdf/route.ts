import { connection } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { isOrderLinkKey } from "@/modules/orders/links";
import { getOrderForBuyer } from "@/modules/orders/service";
import { renderReceiptPdf } from "@/modules/receipts/pdf";
import { getReceipt } from "@/modules/receipts/service";

/** The receipt as a PDF download, behind the order's private key like the order page. */
export async function GET(request: Request, { params }: RouteContext<"/orders/[number]/receipt.pdf">) {
  await connection();
  const key = new URL(request.url).searchParams.get("k");
  const order = await getOrderForBuyer(db, decodeURIComponent((await params).number));
  if (!order || !isOrderLinkKey(order.id, key, env().BETTER_AUTH_SECRET)) return new Response("Not found", { status: 404 });
  const receipt = await getReceipt(db, order.id);
  if (!receipt) return new Response("Not found", { status: 404 });
  const pdf = await renderReceiptPdf(receipt, env().APP_URL);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Astitva-receipt-${receipt.receiptNumber}.pdf"`,
      // Private to the buyer, and it changes as the payment does (cash collected, a refund).
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
