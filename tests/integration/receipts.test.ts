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
import { markDelivered, packOrder, shipOrder } from "../../src/modules/orders/fulfilment";
import { confirmFromCheckout, openPayment } from "../../src/modules/payments/service";
import { renderReceiptPdf } from "../../src/modules/receipts/pdf";
import { getReceipt, issueReceipt, statusLine } from "../../src/modules/receipts/service";
import { fakeRazorpay } from "./fake-razorpay";
import { createVariant, hasDb, makeDb, resetData } from "./helpers";

const SECRET = "test-secret-test-secret-test-secret-123";
const ctx = { appUrl: "https://astitva.test", linkSecret: SECRET };

function buyer(method: "cod" | "online"): CheckoutInput {
  return {
    idempotencyKey: randomUUID(),
    contact: { name: "Asha Rao", phone: "9812345678", email: "asha@example.com" },
    address: { recipientName: "Asha Rao", phone: "9812345678", line1: "12 Model Town", city: "Sonipat", state: "Haryana", pincode: "131001", countryCode: "IN" },
    note: null,
    paymentMethod: method,
  };
}

describe.skipIf(!hasDb)("receipts", () => {
  const db = makeDb(8);
  let admin: string;

  async function order(method: "cod" | "online", userId: string | null = null) {
    const v = await createVariant(db, { onHand: 3, priceMinor: 349_900 });
    const bag = await openBag(db, null);
    await addToBag(db, bag.id, v.id, 2);
    return placeOrder(db, bag.id, buyer(method), userId);
  }

  beforeEach(async () => {
    await resetData(db);
    await db.delete(storeSettings);
    await db.insert(storeSettings).values({ id: 1, orderingOpen: true, codEnabled: true, codMaxOrderMinor: 2_000_000, supportEmail: "hello@astitva.test" });
    const [u] = await db.insert(users).values({ name: "Krishna", email: "k@example.com" }).returning();
    admin = u!.id;
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("cash on delivery: issued with the order, to pay on delivery, then paid once delivered", async () => {
    const placed = await order("cod");
    const r = await getReceipt(db, placed.orderId);
    expect(r?.receiptNumber).toMatch(/^ASTR-\d{6}$/);
    expect(r).toMatchObject({ paymentMethod: "cod", amountMinor: 699_800, status: { kind: "due_on_delivery" } });
    expect(r!.order).toMatchObject({ orderNumber: placed.orderNumber, totalMinor: 699_800, buyer: { name: "Asha Rao" } });
    expect(r!.order.items).toEqual([expect.objectContaining({ quantity: 2, unitPriceMinor: 349_900 })]);
    expect(statusLine(r!)).toMatch(/^To pay on delivery/);

    await packOrder(db, placed.orderId, admin);
    await shipOrder(db, placed.orderId, admin, { carrierName: "Delhivery", trackingNumber: "AWB1", trackingUrl: null });
    await markDelivered(db, placed.orderId, admin);
    const after = await getReceipt(db, placed.orderId);
    expect(after!.status.kind).toBe("paid_on_delivery");
    expect(after!.receiptNumber).toBe(r!.receiptNumber);
  });

  it("online: none until paid, then one with the payment, however often the capture is reported", async () => {
    const fake = fakeRazorpay();
    const placed = await order("online");
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
    const a = await order("cod");
    const b = await order("cod");
    const [ra, rb] = [await getReceipt(db, a.orderId), await getReceipt(db, b.orderId)];
    expect(Number(rb!.receiptNumber.slice(5)) - Number(ra!.receiptNumber.slice(5))).toBe(1);
    expect(await issueReceipt(db, a.orderId)).toEqual({ receiptNumber: ra!.receiptNumber });
  });

  it("goes with the confirmation email as a PDF, and on the account's orders", async () => {
    const [u] = await db.insert(users).values({ name: "Asha", email: "asha@example.com", emailVerified: true }).returning();
    const placed = await order("cod", u!.id);
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
    const placed = await order("cod");
    const r = (await getReceipt(db, placed.orderId))!;
    const many = { ...r, order: { ...r.order, items: Array.from({ length: 30 }, (_, i) => ({ ...r.order.items[0]!, name: `Piece ${i} — नीम` })) } };
    const pdf = await renderReceiptPdf(many, "https://astitva.test");
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
