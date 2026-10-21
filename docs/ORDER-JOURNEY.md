# An order's whole journey: what good stores do, what Astitva does, what's missing

Written 2026-10-21. Each stage below has three parts: what a careful Indian D2C fashion store handles, what Astitva already does (with where it lives), and the gaps, each marked:

- **Must:** law, money or trust. Before launch.
- **Should:** saves Krishna time or saves orders. Soon after launch.
- **Later:** when volume justifies it.

Legend: ✅ have it · ⚠️ partly · ❌ missing.

---

## 1. Looking at a piece

| What good stores handle | Astitva |
| --- | --- |
| Price inclusive of taxes, any strike-through price honest | ✅ "Inclusive of all taxes"; compare-at must be above price (DB check) |
| Live stock per colour and size, sold-out sizes shown but not buyable | ✅ live, uncached buy panel |
| Measurements and size guide | ✅ per-size garment measurements, size guide page |
| More than one angle | ✅ photos per colour, 360° turn (new) |
| "Back in stock" sign-up | ✅ |
| **Delivery check by pincode on the piece page** ("Delivers to 131001 by Fri, COD available") | ❌ only checked at checkout. **Should** |
| Return/exchange summary next to the buy button ("7-day exchange") | ❌ policies are drafts. **Must** (once Krishna decides) |
| **Country of origin** for each product (Consumer Protection (E-Commerce) Rules 2020) | ❌ **Must**: one field, "Made in India" by default |
| Seller's legal name, address, contact and a **grievance officer** (name, contact; acknowledge within 48 h, resolve within a month) | ❌ footer has `TODO(launch)`. **Must** |
| No fake urgency ("only 2 left!" unless true), no pre-ticked add-ons (CCPA dark-pattern guidelines 2023) | ✅ nothing like that exists. Keep it that way |

## 2. The bag

| What good stores handle | Astitva |
| --- | --- |
| Bag survives closing the tab | ✅ server bag, 30-day cookie |
| Adding doesn't lock stock away from real buyers | ✅ by design; checked again under lock at checkout |
| A line that sold out since is marked; checkout blocked until fixed | ✅ |
| Quantity can't exceed stock | ✅ |
| **"The price of X changed since you added it"** | ⚠️ the bag always shows today's price (correct), but doesn't *say* it changed. **Later** |
| Abuse limits on bag changes | ✅ 60 per 10 min |
| Abandoned-bag reminders | ❌ we don't know who the visitor is until checkout. **Later**, and only with consent |

## 3. Checkout

| What good stores handle | Astitva |
| --- | --- |
| Guest checkout, one page | ✅ |
| Server re-prices everything; browser never trusted | ✅ |
| Double tap = one order (idempotency key + bag lock) | ✅ tested |
| Two buyers, last piece: exactly one wins | ✅ tested (and the deadlock fix) |
| Pincode serviceable / COD allowed | ✅ when the pincode list is switched on |
| **Pincode fills in city and state** (India Post data) | ❌ fewer typos, fewer failed deliveries. **Should** |
| Address quality: house/flat number, landmark, warns on very short addresses | ⚠️ basic validation only. **Should** (failed deliveries are mostly bad addresses) |
| Full price breakdown: pieces, discount, shipping, COD fee, total | ✅ |
| Discount codes, race-safe | ✅ tested |
| Phone number required, email optional | ✅ (but no email means no emails, see §6) |
| COD rules: limit, fee, per-phone cap of unconfirmed orders | ✅ |
| Rate limits on checkout | ✅ |
| **Billing name / GSTIN for a business buyer** | ❌ **Later**, only if GST-registered and asked |
| **Explicit agreement to policies** before paying (consent can't be pre-ticked) | ⚠️ the "Place order" button counts as an affirmative act, but the button area should link the returns, shipping and privacy policies. **Must**, small |

## 4. Paying online (Razorpay)

| What good stores handle | Astitva |
| --- | --- |
| Stock held while paying; released if not paid | ✅ 15-min hold, unpaid order closed after 2 h |
| Signature checked **and** payment fetched from Razorpay (amount, currency, status) | ✅ |
| Webhook as the backstop when the tab closes; duplicate events skipped | ✅ by event id, tested |
| Browser and webhook racing → one sale | ✅ tested |
| Razorpay unreachable → order cancelled, stock freed | ✅ tested |
| Paid after the hold lapsed and the stock sold → flag for Krishna, refund | ✅ tested |
| Retry after a failed or closed payment window | ✅ "Pay now" on the order page |
| **Late authorisation** (bank confirms minutes/hours later; <0.5% of payments): either capture automatically or they're auto-refunded after ~5 days | ⚠️ we capture any authorised payment we see, but the webhook isn't subscribed to `payment.authorized`. **Must**: subscribe it, and turn on auto-capture in the Razorpay dashboard |
| **Two successful payments for one order** (buyer pays twice from two UPI apps) | ⚠️ the second should be flagged for a refund, but it isn't tested. **Must**: add the test |
| Nudge COD buyers to prepay (fewer refusals, money sooner) | ❌ **Later**: e.g. in the WhatsApp confirmation message, a "pay now instead" link |
| Live keys, live webhook, a real ₹1 payment and refund | ❌ waiting on the bank account |

## 5. Right after the order

| What good stores handle | Astitva |
| --- | --- |
| Thank-you page with order number and what happens next | ✅ the private order page |
| Confirmation email | ✅ queued, sent through Resend |
| Owner alert | ✅ email per order |
| COD confirmed with the buyer before packing | ✅ WhatsApp, "Confirmed with the buyer" |
| **Buyer can cancel themselves before packing** (no charge allowed unless the seller bears one) | ❌ only by messaging Krishna. **Must** (a button on the order page while confirmed/unpacked) |
| **"Your order was cancelled" email** (by Krishna, by the buyer, or unpaid) | ❌ no template. **Must** |
| **Change the address or phone before dispatch** (very common WhatsApp request) | ❌ Krishna would have to cancel and re-order. **Should** (admin edit, logged) |
| **Private notes on an order** ("called twice, prefers evening") | ⚠️ `orders.internal_note` exists but nothing uses it. **Should** |
| Invoice / bill of supply | ❌ see §9. **Must** |

## 6. Packing and shipping

| What good stores handle | Astitva |
| --- | --- |
| Clear steps: confirmed → packed → shipped → delivered | ✅ machine-enforced |
| Can't pack an unpaid online / unconfirmed COD / flagged order | ✅ |
| Courier + tracking number, "Track your parcel" link | ✅ typed in by Krishna |
| Shipping email with tracking | ✅ |
| **Packing slip and invoice to print** | ❌ **Should** |
| **One piece in an order turns out damaged/missing at packing**: cancel that line, refund that part, ship the rest | ❌ only whole-order cancel. **Should** |
| **Failed delivery attempt (NDR)**: courier couldn't deliver, buyer asked to confirm a re-attempt | ❌ we go straight from shipped to delivered or came-back. **Should**: a "delivery attempt failed" note + WhatsApp nudge, since acting within hours saves the parcel |
| **Delivered email** (and "how did it fit?") | ❌ **Should** |
| Courier booking, labels, live tracking (Shiprocket etc.) | ❌ **Later**, when manual booking hurts |

## 7. Cash on delivery money

| What good stores handle | Astitva |
| --- | --- |
| Delivered ≠ collected ≠ received; track each | ✅ collection machine |
| Delivered but unremitted orders stay visible | ✅ |
| Refused at the door (RTO): stock back, collection failed | ✅ |
| Block repeat refusers | ⚠️ per-phone cap on *unconfirmed* COD orders, but no memory of past refusals. **Later**: warn Krishna when a phone has refused before |

## 8. After delivery: returns, exchanges, refunds

| What good stores handle | Astitva |
| --- | --- |
| Refund through Razorpay or a recorded UPI/bank transfer, never twice | ✅ tested |
| Partial refunds | ✅ |
| Refund email | ✅ |
| **Return/exchange request from the order page** (reason, photos, within N days of delivery) | ❌ **Should**, once Krishna sets the policy |
| Krishna approves → pickup → received and checked → restock or write-off → refund or exchange | ❌ (today: refund manually, adjust stock by hand) |
| Exchange for another size/colour, holding that piece while the old one comes back | ❌ **Should**, fashion's most common request |
| Refund for COD orders needs the buyer's UPI/bank details | ⚠️ recorded after Krishna pays manually; no way for the buyer to give details safely. Part of the return flow |

## 9. Money, tax and records

| What good stores handle | Astitva |
| --- | --- |
| Integer money, never floats | ✅ |
| Every stock change logged; every status change through a machine | ✅ |
| Audit log of admin actions | ✅ |
| **GST**: if registered, a tax invoice per order (GSTIN, HSN, tax split CGST/SGST or IGST by state); on the composition scheme, a bill of supply; if not registered, a plain receipt | ❌ **Must**: Krishna's CA decides which; we then generate the right PDF per order. Selling only on our own site means no marketplace TCS |
| Reports: sales by day/month, COD outstanding, refunds, stock value | ❌ **Should** (an admin dashboard, see below) |
| Nightly encrypted backups | ✅ |

## 10. Privacy (DPDP Act 2023)

| What good stores handle | Astitva |
| --- | --- |
| Privacy policy: what's collected, why, how long, who it's shared with (Razorpay, courier, Resend) | ⚠️ draft. **Must** |
| A way to ask for your data to be deleted | ❌ **Must** (an email address in the policy is enough to start) |
| Keep only what's needed: back-in-stock emails deleted after 90 days | ✅ |
| Order records kept for tax (GST: about 6 years) | ⚠️ never deleted, which is fine; say so in the policy |

---

## What's missing, in order

**Before launch (Must):**
1. Business details and grievance officer on the site; country of origin on pieces.
2. Final policies (returns, exchanges, shipping, cancellation, privacy), linked next to "Place order".
3. Invoice or receipt PDF per order (after asking the CA about GST).
4. Buyer can cancel before packing, plus a "cancelled" email.
5. Razorpay: `payment.authorized` webhook, auto-capture on, a test for paying twice.

**Soon after (Should):**
6. Returns and exchanges from the order page.
7. Pincode → city/state, and a delivery estimate on the piece page.
8. Edit address before dispatch; private notes; cancel one line.
9. Delivered email; failed-delivery step.
10. Packing slip and invoice printing; a dashboard with the numbers.

**Later:** courier integration, COD→prepaid nudge, abandoned-checkout reminders, repeat-refuser warning, price-change notice in the bag.

**Questions for Krishna** (they decide items 1–3 and 6):
- Is Astitva GST-registered (regular or composition), or under the threshold for now?
- Returns: accepted at all? Exchanges only? Within how many days of delivery? Who pays the return courier?
- Who is the grievance officer (name, email, phone), and what business address goes on the site?

---

## Sources

- Consumer Protection (E-Commerce) Rules 2020: [IndiaCorpLaw analysis](https://indiacorplaw.in/2020/08/25/consumer-protection-e-commerce-rules-2020-an-analysis/), [S.S. Rana](https://ssrana.in/articles/consumer-protection-e-commerce-rules-2020/), [Khaitan & Co.](https://khaitanco.com/sites/default/files/2020-08/Stricter%20Regulations%20on%20E-Commerce%20%E2%80%93%20The%20Consumer%20Protection%20(E-Commerce)%20Rules,%202020.pdf)
- CCPA dark-pattern guidelines 2023: [JSA](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/), [SCC Online](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/)
- Razorpay: [late authorised payments](https://razorpay.com/docs/payments/payments/late-authorisation/handle)
- COD, RTO and failed deliveries in India (vendor sources, directional): [Velocity](https://blog.velocity.in/rto-and-ndr-management-in-ecommerce/), [Eshopbox](https://www.eshopbox.com/blog/how-to-reduce-rto-ecommerce-india), [ClickPost](https://www.clickpost.ai/blog/rto-reduction-tools)
- GST: [Tally on GST invoices](https://www.tallysolutions.com/gst/gst-invoice/), [GST Council TCS FAQ](https://www.gstcouncil.gov.in/sites/default/files/2024-02/faqs_tcs.pdf). Confirm with a CA.
