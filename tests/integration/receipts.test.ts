import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { receipts, storeSettings, users } from "../../src/db/schema";
import { listAccountOrders } from "../../src/modules/account/service";
import { addToBag, openBag } from "../../src/modules/bag/service";
import type { CheckoutInput } from "../../src/modules/checkout/input";
import { placeOrder } from "../../src/modules/checkout/service";
import { renderEmail } from "../../src/modules/email/templates";
import { confirmFromCheckout, openPayment } from "../../src/modules/payments/service";
import { renderReceiptPdf } from "../../src/modules/receipts/pdf";
import { getReceipt, issueReceipt, statusLine } from "../../src/modules/receipts/service";
import { fakeRazorpay } from "./fake-razorpay";
import { createVariant, hasDb, makeDb, payOrder, resetData } from "./helpers";

const SECRET = "test-secret-test-secret-test-secret-123";
const ctx = { appUrl: "https://astitva.test", linkSecret: SECRET };

function buyer(): CheckoutInput {
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone: "9812345678", email: "asha@example.com" },
    address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
  };
}

describe.skipIf(!hasDb)("receipts", () => {
  const db = makeDb(8);

  async function order(userId: string | null = null) {
    const v = await createVariant(db, { onHand: 3, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id, 2);
    return placeOrder(db, bag.id, buyer(), userId);
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, supportEmail: "hello@astitva.test" });
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("an older receipt with no online payment states the total, and nothing about how it was paid", async () => {
    const placed = await order();
    await payOrder(db, placed.orderId);
    await db.update(receipts).set({ paymentMethod: "cod", paidAt: null, paidWith: null, providerPaymentId: null }).where(eq(receipts.orderId, placed.orderId));
    const r = await getReceipt(db, placed.orderId);
    expect(r!.status.kind).toBe("total_only");
    expect(statusLine(r!)).toBe("Order total: ₹6,998.");
    expect(Buffer.from((await renderReceiptPdf(r!, "https://astitva.test")).slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("online: none until paid, then one with the payment, however often the capture is reported", async () => {
    const fake = fakeRazorpay();
    const placed = await order();
    expect(await getReceipt(db, placed.orderId)).toBeNull();
    const session = await openPayment(db, fake.rzp, placed.orderId);
    const { reply } = fake.pay(session.razorpayOrderId);
    await confirmFromCheckout(db, fake.rzp, reply);
    await confirmFromCheckout(db, fake.rzp, reply);

    expect(await db.select().from(receipts).where(eq(receipts.orderId, placed.orderId))).toHaveLength(1);
    const r = await getReceipt(db, placed.orderId);
    expect(r!.status).toMatchObject({ kind: "paid_online", paidWith: "upi", reference: reply.razorpayPaymentId });
    expect(statusLine(r!)).toMatch(/^Paid ₹6,998 online \(UPI\)/);
  });

  it("numbers receipts in sequence, one per order, and keeps what it froze", async () => {
    const a = await order();
    const b = await order();
    await payOrder(db, a.orderId);
    await payOrder(db, b.orderId);
    const [ra, rb] = [await getReceipt(db, a.orderId), await getReceipt(db, b.orderId)];
    expect(Number(rb!.receiptNumber.slice(5)) - Number(ra!.receiptNumber.slice(5))).toBe(1);
    expect(await issueReceipt(db, a.orderId)).toEqual({ receiptNumber: ra!.receiptNumber });
  });

  it("goes with the confirmation email as a PDF, and on the account's orders", async () => {
    const [u] = await db.insert(users).values({ name: "Asha", email: "asha@example.com", emailVerified: true }).returning();
    const placed = await order(u!.id);
    await payOrder(db, placed.orderId);
    const r = await getReceipt(db, placed.orderId);

    const email = await renderEmail(db, "order_placed", { orderId: placed.orderId }, ctx);
    expect(email!.html).toContain("Your receipt");
    expect(email!.html).toContain(r!.receiptNumber);
    expect(email!.text).toContain(`Receipt ${r!.receiptNumber}`);
    expect(email!.attachments).toHaveLength(1);
    expect(email!.attachments![0]!.filename).toBe(`Astitva-receipt-${r!.receiptNumber}.pdf`);
    expect(Buffer.from(email!.attachments![0]!.content.slice(0, 5)).toString()).toBe("%PDF-");

    const [listed] = await listAccountOrders(db, { userId: u!.id, email: "asha@example.com" }, SECRET);
    expect(listed!.receipt).toEqual({ number: r!.receiptNumber, href: expect.stringMatching(new RegExp(`^/orders/${placed.orderNumber}/receipt\\?k=`)) });
  });

  it("draws a long order over more than one page", async () => {
    const placed = await order();
    await payOrder(db, placed.orderId);
    const r = (await getReceipt(db, placed.orderId))!;
    const many = { ...r, order: { ...r.order, items: Array.from({ length: 30 }, (_, i) => ({ ...r.order.items[0]!, name: `Piece ${i} — नीम` })) } };
    const pdf = await renderReceiptPdf(many, "https://astitva.test");
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
