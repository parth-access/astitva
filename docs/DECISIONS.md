# Decisions

Short records of choices that differ from, or add to, the revised PRD. Newest first.

## 2026-10-22 — Customer passwords, a sign-up page, and verifying the email

**Decision:** Customers can also have a password (this changes "no passwords" in the accounts entry below). `/account/sign-up` asks for name, mobile, email and password (8 to 128 characters) and signs them in straight away; the email isn't verified yet. Sign-in offers a password or a code by email, plus Google. Forgot it: a code by email, then a new password, which signs out every other device. An account made by a code or Google can set a password the same way.

**Verifying:** until the email is proved, Your details shows a "Needs attention: Verify your email" card (a code by email, typed in), and the other account pages point to it. An unverified account sees only orders placed while signed in to it; guest orders with that email appear once it's verified, so nobody can sign up with someone else's email to see their orders. Google won't attach itself to an unverified account (Better Auth's default).

**How:** the customer Better Auth instance enables email and password without requiring verification first, and opens `/sign-in/email`, `/email-otp/verify-email` and `/email-otp/reset-password`. Signing up goes through a server action (`signUpAction`), which checks each field, then at most 10 new accounts an hour per network. Codes now have three purposes (sign in, verify, new password), each with its own email; the 4-per-email limit covers them all. An admin's email never gets a verify or reset code from the customer side, and its password can't be reset there.

**Waiting:** every account button shows a spinner and its own "Signing out…"-style label, and is disabled until the action finishes. After signing in, the browser loads the next page in full, so nothing remembered from before ("/account sends you to sign in") can loop.

## 2026-10-22 — No confirming cash orders, for now

**Decision:** Cash-on-delivery orders are no longer confirmed with the buyer on WhatsApp before packing; they're ready to pack as soon as they're placed. WhatsApp isn't in use yet, so nothing tells buyers to expect a message: checkout, the FAQ, the order page and the order email just say they pay the courier when it arrives. The admin has no "To confirm" step, and the new-order email has no "Confirm on WhatsApp" button.

**Kept:** `orders.cod_verified_at` and `markCodVerified`, unused, for when confirmation comes back (with WhatsApp codes, or if fake orders become a problem). A phone number may still have at most 2 cash orders not yet packed.

## 2026-10-22 — Customer accounts: sign-in by email code or Google, apart from the admin

**Decision:** Customers can have accounts, but guest checkout stays and an account is never required. Sign-in is a 6-digit code by email (free, through Resend) or Google; no passwords. WhatsApp codes come later, with the WhatsApp Business setup (about ₹0.12 + GST a message; it also unlocks order updates and COD confirmation on WhatsApp). SMS was ruled out: about the same cost, plus DLT paperwork.

**How:**
- A second Better Auth instance (`src/modules/auth/customer-config.ts`) at `/api/account`, with its own cookie (`astitva.session_token`), 60-day sessions and the email-OTP plugin. The route answers only the sign-in paths (`CUSTOMER_AUTH_PATHS`); password resets, email changes and the rest are a 404.
- **The wall between admin and customers.** Both instances share the users and sessions tables and the secret, so a customer's session token pasted into the admin's cookie would otherwise pass, and an admin could otherwise sign in with an emailed code, skipping the password and 2FA. So each session records the sign-in that made it (`auth_sessions.kind`, no default). The admin accepts only `admin` sessions and makes them only for people with a role; the customer side makes `customer` sessions only for people without one. Admins shop with another email. Tested both ways.
- Codes last 10 minutes, allow 5 tries, are stored encrypted, and asking again resends the same code. At most 4 codes per email per 15 minutes; per-network limits are generous because many mobile users share an address.
- New tables: `customer_addresses` (one default each) and `saved_pieces` (hearts, by style). `users.phone_verified`: guest orders are linked to an account only by an email or phone proved with a code.

**Account pages** (`/account`, behind `requireCustomer()`; `proxy.ts` sends visitors without the cookie to sign in): orders (the account's, and guest orders with its email, leaving out online checkouts never paid), addresses (up to 10, one used first), and details (name, mobile, sign out everywhere, delete the account). Deleting removes sign-ins, sessions, addresses, saved pieces and back-in-stock alerts; orders stay, unlinked, for tax records. The header shows an account icon on wider screens; on phones it's in the menu.

**Next:** checkout using the account, the bag following the account, hearts.

## 2026-10-21 — The site speaks as Astitva; content confirmed

- **Voice:** buyers hear from "we" and "Team Astitva", not one person. "Who answers" in the settings is now optional and blank by default ("We'll message you on WhatsApp", "Ask us about the fit"); styling notes read "How we'd wear it", signed Team Astitva, and emails are signed Team Astitva. Krishna's letter on the home page keeps its own signature (Lookbook & settings → "Signed").
- **Contact page:** WhatsApp and email as two cards, read from the settings, plus where to go for orders, fit and quick answers. A missing one just doesn't show.
- **Business details:** the registered name is Astitva. No address is published, and there's no GSTIN yet; the footer reads "© Astitva. All rights reserved."
- **Policies** stay drafts (kept out of search), each saying it's being updated and will be here soon.
- **Confirmed:** the hand-packed promise (shown everywhere now) and the brand colours. The final logo is on its way.
- **FAQ:** 18 questions in four groups, each describing what the site actually does; undecided policies point to their pages.
- **Categories:** every active category stays in the shop's list; one with no published styles is marked "soon" and shows its garment sketched with "Coming soon".

## 2026-10-21 — Find your order, friendlier

**Recent orders in this browser** (`src/components/storefront/orders-on-device.tsx`): opening an order's private page keeps its address, number, date, total and the first piece's name in `localStorage`, so `/orders` lists them at the top, one tap from the page. Nothing is sent to us, and the browser already had that address; each can be forgotten, or all at once. Most buyers come back on the phone they ordered with, so most never need the form.

**The form:** fixed `AST-` and `+91` prefixes with number keypads (pasting "AST-001005" leaves just the digits), an error under the field whose *shape* is wrong (never whether an order matched), and a "check your inbox" screen that names the order and the email's subject, says where else to look, and offers WhatsApp with the order number already typed, or trying different details. Help below: where the order number is, and what to do without an email on the order.

**Not a bug:** streamed pages (like an order page) show their content on the browser's next painted frame. A tab that's in the background, or a hidden preview pane, paints nothing, so the content appears when the tab is in front.

## 2026-10-21 — Emails as letters

**Decision:** Every email reads like a letter from Krishna, not a receipt: the mascot in an arch, the pieces in small arches (their photo in the colour bought, or the colour with the name painted on), where the order is as a five-step bar, her note on how she'd wear the piece, the hand-wrapped card it will carry (while that promise is a draft, only outside production), and her signature. Krishna's own emails are practical: the amount and buyer first, and for cash on delivery a "Confirm on WhatsApp" button with the confirmation message already written.

**How** (`src/modules/email/layout.ts`, `templates.ts`): tables and inline styles, no scripts, SVG or WebP (photos come from Cloudinary as JPEG at twice the size), a hidden preview line for the inbox, `color-scheme: light only`, under 15 KB each (Gmail clips at about 102 KB). Gmail, Outlook and most Android mail can't load web fonts and fall back to Georgia and Helvetica; Apple Mail gets Playfair and Montserrat from `public/email/fonts`. The mascot is padded with her own paper (`public/email/mascot.jpg`) so the arch never cuts the hat. Order and shipping emails carry schema.org `Order` / `ParcelDelivery` markup, which Gmail may show as a card (it needs SPF and DKIM, which Resend sets up; no registration for cards without buttons). Plain-text versions stay. The admin's password email uses the same frame.

**Preview:** `npm run email:preview` renders every email from the database into `.email-preview/` (ignored by git), each at desktop and phone width on `index.html`.

## 2026-10-21 — Page transitions, loading skeletons, the admin redesigned

**Transitions** (`src/components/brand/transitions.tsx`, `src/lib/transition-types.ts`, CSS in `globals.css`): React's `<ViewTransition>` in `template.tsx` for the store and the admin, so every navigation can animate. A link says which way it goes: deeper (`FORWARD`, slides in from the right), back up (`BACK`, from the left) or across to a sibling page (`ACROSS`, a small rise). Untyped changes (browser back, a refresh after saving) don't move. The header and the admin's navigation are named so they stay still. Reduced motion switches it all off. Not a `usePathname()`-keyed wrapper in the layout: that made every page dynamic and failed the build.

**Skeletons:** storefront pages' loading boundaries are `<Reveal>` (`src/components/brand/reveal.tsx`): the skeleton fades, the content rises. The buyer's order page has its own skeleton. Every admin page has a `loading.tsx` shaped like it (`src/components/admin/skeletons.tsx`), and the admin's frame no longer waits for the sign-in check before drawing.

**Admin:** a sidebar on computers and tabs along the bottom on phones (with the "needs you" count), cards instead of ruled lines (`Card`, `PageHeader`, `Chip`, `Stat`, `Tabs`, `EmptyState` in `src/components/admin/ui.tsx`, on a new `paper` colour), and a **Today** page: what's waiting (to confirm, needs you, to pack, to send, on the way), sales for 7 and 30 days (orders that went ahead, before refunds), cash couriers still owe, open orders and colours/sizes running low (`src/modules/orders/overview.ts`, tested). Orders show a progress strip, and on phones the order's next action comes first. Pieces show their photo, colours, stock and low-stock count.

## 2026-10-21 — Find my order, back-in-stock alerts, discount codes

**Find my order** (`/orders`, `src/modules/orders/lookup.ts`): the order number (typed any way: "1004", "AST-001004") and the mobile number on it. If both match and the order has an email, its private link is emailed there, at most once an hour; it is never shown on the page, and the page answers the same whether or not anything matched, so it can't be used to learn who ordered what. 5 tries per 15 minutes per visitor. An order without an email is pointed to WhatsApp, and the admin's order page has "Send them their order page" (a WhatsApp message with the link).

**Back in stock** (`stock_alerts`, migration 0010, `src/modules/alerts`): under a sold-out colour and size, "Tell me when Ink S is back" takes an email. When that variant can be bought again (checked every 15 minutes, and straight after a piece is saved or an order's stock is put back), everyone waiting is emailed once; claiming by setting `notified_at` means two runs never email twice. Addresses are deleted 90 days after notifying (180 days if it never comes back). The admin piece page shows how many people wait for each colour and size.

**Discount codes** (`discount_codes`, migration 0011, `src/modules/discounts`, admin → Discounts, owners only): a percentage (rounded to whole rupees) or a fixed amount off the pieces, never shipping; free shipping is judged after the discount. Optional start/end dates (India time), minimum order, total uses, once per mobile number (default on). Checkout previews a code ("Have a code?"); placing the order locks the code row, re-checks everything and counts the use, so a limited code can't be overused by buyers racing (tested: 4 buyers, 2 uses). The discount is split across the order lines to the paisa (`allocateDiscount`), and the order keeps the code as typed. A cancelled order, an unpaid online checkout that is closed or replaced, gives its use back; a returned parcel doesn't. Codes are switched off, never deleted.

## 2026-10-21 — Search and sharing

**Decision:** Every public page says what it is to search engines and to the apps people share links in, using only facts the page already shows.

**How** (`src/lib/seo.ts`, `src/lib/og.tsx`):
- **Titles and descriptions:** the home page leads with the brand and the lookbook's title; a piece reads "Neem linen wrap dress in Sage, Ivory, Rust and Ink | Astitva", and its description adds its colours, sizes, fabric and price to its story. A piece's SEO title/description fields in the editor override these. Every public page has a canonical address; the shop's sort and filter views point to `/shop`.
- **Structured data (JSON-LD):** Organization (with WhatsApp and email when set) and WebSite on the home page; BreadcrumbList on each piece; each style as a **ProductGroup** with one Product per colour and size (price in INR, stock, condition, the colour's photos), so search can show the right price and colour. Product data is published **only while ordering is open**: before that nothing can be bought. Text is escaped so it can't break out of its script tag.
- **Share cards** (1200×630, what WhatsApp, Instagram and search show): the site's card has the lookbook title in arches of the season's colours; each piece's card has its photo (or its colour), number, name, swatches, sizes and price. Pieces' cards live at a stable address, `/pieces/<slug>/share.png`, because Next's `opengraph-image` convention adds a build hash to the address, which the sitemap and product data can't use. The renderer needs static fonts: `src/fonts/og` (Playfair and Montserrat `.woff`, plus Playfair's latin-ext file for the ₹ sign).
- **Sitemap:** last-changed dates and an image for each piece; draft policies left out. Draft policy pages also say `noindex` until they're final.

**After launch:** add the site to Google Search Console and submit `/sitemap.xml`; check a piece with Google's Rich Results Test.

## 2026-10-21 — Alerts, emails, scheduled jobs, backups and hardening (M6, part 1)

**Decision:** Owners hear about orders by email; every email goes through the outbox and Resend; housekeeping runs from GitHub Actions; backups are encrypted pg_dumps kept as workflow downloads.

**How:**
- **Outbox** (`src/modules/email`): emails are queued in the same transaction as the change they report, rendered at send time from the order as it stands, and sent straight after the request (`after()`), then retried by the 15-minute job (1, 5, 30 min, 2, 6 h; failed after 6 tries, shown on the admin home). Rows are claimed with a 10-minute lease (`FOR UPDATE SKIP LOCKED`), so two workers never send the same email.
- **Who hears what:** owners (role `owner`) get "New order" for a COD order or a captured online payment, "Needs you" whenever an order is flagged, and error alerts (payment confirmation, webhook, refund, admin action, scheduled job failing), at most one per kind per hour. Buyers get order placed, shipped (with tracking) and refunded. An unpaid online checkout tells nobody.
- **Scheduled jobs** (`/api/cron/frequent|daily`, Bearer `CRON_SECRET`, constant-time compare): GitHub Actions, not Netlify scheduled functions, because Netlify's free plan counts them against its credits and this keeps the host replaceable. The repo is public, so Actions minutes are free.
- **Unpaid online checkouts** are cancelled after 2 hours (holds lapsed long before). A payment that still arrives is flagged for a refund as before.
- **Backups:** nightly `pg_dump` with Postgres 17 tools (Supabase runs 17), TLS verified against Supabase's CA, encrypted with GPG AES-256 before upload, 30 days. Public repo: never unencrypted.
- **Abuse limits** (`request_limits`, migration 0009): fixed windows counted with one atomic upsert; keys are HMACs, never raw IPs or phone numbers. Bag changes 60 per 10 min per visitor; checkout 10 per 10 min per visitor and 5 orders per hour per phone. A refused bag request creates no bag.
- **Security headers** (`src/lib/security-headers.ts`): CSP listing only Razorpay and Cloudinary, no framing (`frame-ancestors 'none'`, `X-Frame-Options`), nosniff, strict referrer, permissions off, HSTS two years in production. Scripts need `'unsafe-inline'`: Next streams page data in inline scripts and the intro runs inline; a nonce would make every page dynamic.
- **Search:** `sitemap.xml` (home, shop, pieces, help and policy pages) and `robots.txt` (keeps admin, checkout, order pages and API out).

**Fixed on the way:** opening a piece with `?colour=` changed the colour before the streamed buy panel hydrated, so its HTML (default colour) disagreed with the browser (React error 418). The address's colour is now adopted by the buy panel after it hydrates.

## 2026-10-20 — Packing, shipping, returns and refunds (M5)

**Decision:** Krishna runs every order to its end from the admin's order page; the buyer's private order page follows along. No courier integration yet: she books with the courier and types the courier and AWB in.

**How:**
- **Steps** (`src/modules/orders/fulfilment.ts`): confirmed → packed → shipped → delivered, or shipped → **returned** when the courier brings it back (RTO). `returned` is a new order status (migration 0008); cancelling after dispatch stays refused. Shipping straight from "confirmed" packs it on the way. A COD order can't be packed until it's confirmed with the buyer; an online one until it's paid; a flagged one until it's sorted.
- **Came back:** the pieces go back on sale as a `return_restock` movement (`restockCancelledOrder` takes the movement type), COD collection fails, and a paid order is flagged for a refund.
- **COD money:** delivered → the courier holds the cash (`collected_by_courier`); "The courier has paid us" → `remitted` and only then is the order `paid`. Delivered-but-unremitted orders stay in the admin's Open list.
- **Refunds** (`src/modules/payments/refunds.ts`, owners only): Razorpay (back to the card or UPI it came from) or a UPI/bank refund Krishna already sent herself, recorded with its reference. The refund row is written under the order lock before Razorpay is called, so two clicks can't refund twice; never more than was received minus refunds not failed. Razorpay's reply or the `refund.processed` / `refund.failed` webhook settles it, once. Payment status follows: partially refunded, then refunded. A paid-too-late order refunded in full is closed as cancelled, and a flag clears itself on a full refund; otherwise "Mark as sorted" with a note.
- **Buyer's page:** packed, on its way (courier, AWB, "Track your parcel"), delivered, came back, refunds on their way.
- Shipping emails go into `email_outbox` (`order_shipped:<id>`) for when Resend is set up.

**Not yet:** customer-initiated returns and exchanges after delivery (a return request flow); courier booking and live tracking (Shiprocket or similar) if volume grows.

## 2026-10-20 — Online payment with Razorpay (M4), test mode first

**Decision:** Razorpay Standard Checkout (its own payment window: UPI, cards, netbanking) beside cash on delivery. Built and run in test mode until Krishna's current account is opened and Razorpay activates live payments; switching is only a change of keys.

**How** (`src/modules/payments`):
- Choosing "Pay now" places the order `pending_payment` with its stock **held** for the store's reservation time (15 minutes), not taken. The bag is kept until the money arrives. Starting checkout again from the same bag cancels the earlier unpaid order and drops its hold, so a buyer never holds stock against themselves.
- A Razorpay order is created for the total **as stored on our order**; reopening the window reuses it. If Razorpay can't be reached, the order is cancelled and the hold released at once.
- Paid means: the reply's signature checks out (HMAC of `order_id|payment_id` with the key secret), **and** Razorpay's own record of the payment says captured, for exactly the stored amount in INR (an authorised payment is captured by us). Only then does the hold become a sale, the order become confirmed/paid, the email get queued and the pieces leave the bag.
- The webhook (`/api/webhooks/razorpay`, signed over the raw body with `RAZORPAY_WEBHOOK_SECRET`) does the same, so a closed tab still ends in a paid order. Events are recorded once by Razorpay's event id with ids, amounts and status only; a delivery that failed is retried, a repeat of a processed one is skipped. Browser and webhook racing end in one sale (tested).
- **Paid too late:** if the hold lapsed and the stock went to someone else, or the order was cancelled first, the payment is still recorded, the order is flagged `needs_resolution` ("Needs you" in the admin) and the buyer's page says Krishna will offer another colour or size, or a refund. Cancelling a paid order flags a refund the same way. Refunding from the admin is M5; until then, from Razorpay's dashboard.
- The COD fee and limit don't apply to online orders. Unpaid online checkouts stay out of the admin's "Open" list (they're under "All").
- No SDK: four REST calls and two HMAC checks (`razorpay.ts`), with `fetch` injectable so tests run against a stand-in Razorpay.

**Before going live:** live keys in the host's environment, the webhook set up on the live account, one real ₹1 payment and refund.

## 2026-10-20 — Bag, guest checkout and cash on delivery (M3)

**Decision:** A guest bag kept on the server, a one-page checkout, and cash on delivery as the only way to pay until Razorpay (M4). Krishna confirms every COD order with the buyer on WhatsApp before packing.

**How:**
- **Bag** (`src/modules/bag`): one `carts` row per visitor, found by a random cookie token (`astitva_bag`, httpOnly, 30 days); only its SHA-256 is stored. Adding does **not** hold stock: it is checked on add and again under lock at checkout, so bags never lock pieces away from real buyers. A line that has sold out or been withdrawn since is marked in the drawer, and checkout won't proceed until it's changed.
- **Checkout** (`src/modules/checkout`): `placeCodOrder` locks the bag row (so a double tap waits, then finds the first order through the idempotency key), re-reads prices and settings, checks the COD rules, creates the order `confirmed` / `unpaid`, takes the stock (`reserveForOrder` in commit mode), writes the lines, a pending `cod_collections` row, an `order.placed` event and (with an email) an `email_outbox` row, then empties the bag. All in one transaction.
- **Lock order matters:** stock is taken *before* the order lines are written. An order line's foreign key to its variant takes a shared lock on that row; taking that first and the row lock second deadlocked two buyers of the last piece (caught by the concurrency test).
- **COD rules** (store settings, editable under Lookbook & settings): on/off, a fee, an order limit (₹5,000 placeholder), the pincode list when `restrict_to_listed_pincodes` is on, and at most 2 unconfirmed COD orders per phone number.
- **Shipping** is a flat charge with an optional free-shipping line. Placeholder: free.
- **The buyer's order page** is `/orders/AST-001001?k=…`, where `k` is an HMAC of the order id with `BETTER_AUTH_SECRET`. Nothing extra is stored, and sequential order numbers can't be guessed into someone's address. A wrong key is a 404.
- **Admin Orders**: list (to confirm / open / all), detail, a prepared WhatsApp message, "Confirmed with the buyer" (`cod_verified_at`), and cancel with a reason (stock back exactly once, collection marked failed). Packing and shipping are M5.
- **Phone numbers** are stored as the 10 national digits.

**Dropped:** the "show my city in the archive" opt-in (`orders.share_city_in_archive` stays, unused): the archive is gone.

**Not yet:** sending the queued confirmation emails (needs Resend on the domain); OTP for COD (about ₹0.20 a message; add if fake orders become a problem).

## 2026-10-20 — A fashion label, not a one-of-one boutique

**Decision:** Astitva sells styles in whatever colours and sizes it has: a style (product) has variants for each colour × size, each with its own stock. Nothing fixes how many colours or sizes a style has; the admin builds the grid from what the seller has, and the storefront shows only that. Later, Krishna's own designs use the same model. Chapters, the archive of sold pieces and all one-of-one language ("One of one", "Found its home") are gone.

**Why:** Parth: the launch is a few styles in several colours (3 styles × 4 colours now), and the brand will make its own designs. The one-of-one framing came from an earlier assumption.

**How:**
- Variants carry a colour name and swatch (`product_variants.color`, `color_hex`); photos can be tied to a colour (`product_images.color`). The painted sketch is washed in the colour's swatch.
- The piece editor's grid: one row per colour, one column per size; a number is stock, blank means "not made". Saving sets each count through the inventory service ("Count set in the piece editor"); blank or removed combinations are switched off, never deleted; renaming a colour or size keeps its stock. Price, condition and private cost are per style.
- The home page lookbook's title, subtitle and Krishna's note, and whether ordering is open, are store settings (`/admin/settings`, owners only). Migration 0007 copied the last chapter's title and letter into them before dropping chapters. `/chapters/*` and `/archive` redirect home.
- Style numbers ("Nº 01") stay: unique, fixed once published.

## 2026-10-20 — The home page becomes a printed lookbook

**Decision:** The home page and chapter pages are a printed lookbook (cover spread, letter, contents, a page per piece) instead of a cover followed by a grid of spreads. Pieces without photographs show a painted sketch of their garment instead of a flat colour plate, everywhere a plate appears. Details: `docs/DESIGN.md`.

**Why:** Parth found the old home page didn't feel premium or "wow". Every reference that does (Raw Mango, Dôen, Bode) opens with something full-width and confident, and the old page leaned on photography that doesn't exist yet, so it read as the same coloured arch repeated. The lookbook gives scale (the title across the fold), rhythm (pages rather than a feed) and craft (folios, contents, paper, ink), and the sketches carry the intro's "drawn, then painted" idea through the site until the shoot.

**Sketches are drawn in code**, not generated per piece: four hand-tuned garment drawings chosen by category, coloured by tone, so every new piece gets one at no cost. A painted illustration of each actual garment (an illustrator, or paid image generation) can replace them piece by piece later. The ink animation is limited to wide screens because redrawing SVG filters every frame is too heavy for phones.

## 2026-10-20 — Piece editor rules

**Decision:** Pieces are created as drafts and published from the editor. A published piece can be hidden and put back, but never returns to draft (`productMachine`). Its number and web address are fixed at first publish, because both are printed on cards, shared on WhatsApp and linked from Instagram. Publishing needs a number, a name and one size on sale.

**How:** Admin reads and writes live in `src/modules/catalog-admin` (they include cost and internal reference), separate from the storefront's `src/modules/catalog`. Prices are typed in rupees and stored as paise. Opening stock and every later change go through the inventory service as movements with a reason ("More arrived", "Count was low/high", "Damaged or lost"). Every save writes an audit row and calls `updateTag("catalog")`, so the change shows on the site at once. Sizes are switched off, never deleted.

**Chapters** follow the same pattern: drafts, published with `chapterMachine`, a release date required to publish (a database rule too). While a chapter is published its number and web address are fixed; unpublishing hides the chapter page, and its pieces stay on the site. Release times are typed and shown in India time. A new cover replaces the old file on Cloudinary (`astitva/chapters`). The letter editor has a preview that uses the storefront's own `Letter` component.

**Not yet:** suppliers (no editor yet; the field stays empty).

**Gotcha:** in a one-table Drizzle query, `${table.id}` inside a raw `sql` subquery renders as a bare `"id"`, which the subquery binds to its own table. Write the outer table name out in correlated subqueries. This had hidden the shop's category filters.

## 2026-10-20 — Piece photos on Cloudinary, uploaded from the browser

**Decision:** Photos go from the admin's browser straight to Cloudinary, so phone photos of any size never pass through our server. Our server signs each upload (signed-in admins only; images only; into `astitva/pieces`; shrunk on arrival to at most 2400×3000 to save free-plan storage). Cloudinary's reply is signed too, and the server checks that signature and the address before recording the photo, so nobody can attach an image from elsewhere. Signing is done in `src/modules/media/cloudinary.ts` (SHA-1, Cloudinary's documented scheme) rather than with the SDK, whose types lag its code.

**Details:** The first photo is the cover in the piece's arch. A piece without a tone takes the main colour of its first photo. The storefront asks Cloudinary for each size and the best format (`f_auto,q_auto`), so photos don't use the host's image allowance. Removing a photo deletes the file on Cloudinary after the response (best effort). The stored URL is the untouched original.

## 2026-10-20 — Hosting on Netlify (free), photos on Cloudinary

**Decision:** Launch on Netlify's free plan. Store and serve product and chapter photos from Cloudinary's free plan.

**Why:** Vercel's free Hobby plan forbids commercial use (taking payment or advertising products counts), and Pro costs $20/month. Netlify's free plan allows commercial use and its Next.js adapter lists Cache Components as fully supported. Cloudflare Workers' free plan allows 10 ms of CPU per request, too little for server-rendered pages with database reads. Cloudinary resizes and converts images itself, so photos don't use the host's image allowance and stay put if we change host. Supabase Storage's free plan has 5 GB of egress shared with the database and no resizing.

**Watch:**
- Netlify's free plan pauses every site on the account when its 300 monthly credits run out. Production deploys cost credits, so deploy deliberately. If traffic nears the limit, Netlify Personal ($9) or Vercel Pro ($20) are the ways out; the code stays host-neutral so moving is configuration, not code.
- Confirm with a test deploy before launch that Cache Components, `updateTag` and `proxy.ts` behave on Netlify.
- Supabase free projects pause after a week without activity and have no daily backups. Before launch (M6): a daily GitHub Action that hits `/api/health`, and a nightly `pg_dump` kept privately.

## 2026-10-20 — Admin sign-in: Better Auth, password plus required 2FA

**Decision:** Better Auth with email and password, then a 6-digit authenticator-app code (TOTP). 2FA is required: an admin without it is sent to set it up and can reach nothing else. Backup codes, and "trust this device for 30 days". Passkeys (Face ID, fingerprint) follow as a second way in. No public sign-up: accounts are created by a script. Krishna and Parth are both owners. Password reset by email through Resend on the brand's domain.

**How:** Better Auth uses our `users` table (UUID ids) and adds its own session, account, verification and two-factor tables, all with RLS like every other table. Roles stay in `admin_role_assignments`. Every admin page and server action checks the session and role on the server; `proxy.ts` only redirects signed-out visitors early, as a convenience. Login rate limits are stored in the database, because serverless instances don't share memory.

**Cache:** After a catalogue edit, server actions call `updateTag("catalog")` so the editor sees the change at once. One-argument `revalidateTag` is deprecated in Next 16; outside server actions use `revalidateTag("catalog", "max")`.

## 2026-10-20 — First-visit intro: the mascot sketched, then painted

**Decision:** On a first visit the Astitva woman is drawn in fine lines and then her painting arrives part by part (sketch to colour, chosen by Parth and Krishna). Details: `docs/DESIGN.md`.

**How it is built:** The colour stage uses the original painting cut into transparent layers rather than a vector trace: automatic tracing posterised her hair and skin, which looked cheap next to the logo. The sketch is hand-placed SVG strokes drawn with `stroke-dashoffset`. The intro runs from inline scripts, not React, so it starts on first paint and does not wait for hydration; the overlay markup is server-rendered with `suppressHydrationWarning` on the elements the script touches.

**Guardrails:** once per browser, skippable, never blocks the page (it renders underneath), off for admin/checkout/API, reduced-motion aware, 7-second CSS failsafe, no JavaScript means no intro.

## 2026-10-20 — The storefront is a lookbook of chapters

**Decision:** Pieces are released in numbered chapters, each opened by a letter. Every piece has a house number (`Nº 07`) and a given name, plus a provenance story and a styling note. Sold pieces stay on the site in the archive. Piece pages moved from `/products/<slug>` to `/pieces/<slug>` (permanent redirect in `next.config.ts`). Design details: `docs/DESIGN.md`.

**Why:** Research on premium labels (Sézane began exactly as curated drops of found pieces; Dôen releases "chapters"; Torani names collections; one-off vintage shops keep sold items visible). A one-of-one curated catalogue is the brand's strength, so the site is built around it rather than around a product grid.

**Details:**
- Piece numbers are unique across all chapters and never reused, so a number identifies a piece for good (cards in parcels, WhatsApp messages, the archive).
- A buyer's city appears in the archive only if they opt in at checkout (`orders.share_city_in_archive`, default off). Checkout (M3) must ask.
- `chapters.release_at` is displayed now; checkout must refuse orders for a chapter before it opens.
- Copy that promises something (`src/content/brand.ts`) is hidden in production until Krishna confirms it. `SHOW_DRAFT_COPY=1` shows it in a production build for review.
- Pages that compare against the current time (chapter "Opens"/"Opened") are cached for minutes, not hours.

## 2026-10-19 — Supabase as plain Postgres, locked down

**Decision:** Supabase hosts the database. The app talks to it only through Drizzle over the Postgres protocol, as the table owner. Every table has RLS enabled with no policies (`.enableRLS()` in the schema), and migration 0003 revokes all privileges from Supabase's `anon` and `authenticated` roles. A test fails if any table lacks RLS.

**Why:** Supabase exposes the `public` schema through its Data API. Without this, anyone holding the anon key (which is designed to be public) could read customer addresses or change stock and orders. We don't use supabase-js, Supabase Auth or Storage, so this costs nothing.

**TLS:** Supabase certificates chain to Supabase's own CA. `src/db/ssl.ts` verifies against that CA (`DATABASE_CA_CERT_FILE` locally, `DATABASE_CA_CERT` on Vercel) and refuses to connect to any non-local database without it. Tested against a Postgres with a private CA: right CA connects, wrong CA fails, no CA refuses.

**Migrations:** `npm run db:migrate` runs `scripts/migrate.ts`, which uses the app's own connection code, so TLS behaves the same for migrations and the app.

## 2026-10-19 — Drizzle instead of Prisma

**Decision:** Use Drizzle ORM with plain SQL migrations.

**Why:** The PRD's invariants lean on database constraints: CHECK constraints on money and stock, partial unique indexes (one live reservation per order line, unique provider payment ids when present), and expression indexes. Drizzle declares all of these in `schema.ts` and generates them into migrations. Prisma cannot express CHECK constraints or partial indexes in its schema, so they would live in hand-edited migrations that drift from the schema file. Drizzle's `.for("update")` also makes the row lock in the reservation engine explicit. A practical factor too: Prisma 7's migration engine is a separately downloaded binary, which failed in the build environment.

**Cost:** Slightly less polished migration tooling. Always read the generated SQL before committing a migration.

## 2026-10-19 — Inventory movements record on_hand changes only

**Decision:** `inventory_movements` gets a row only when `on_hand` changes (receipt, sale, cancellation restock, return restock, adjustment, damage). Holds are recorded in `inventory_reservations`, not as zero-delta movements.

**Why:** Keeps the invariant simple and testable: `on_hand` always equals the sum of its movement deltas. The reservation table is already the log of holds.

## 2026-10-19 — Late payments may revive lapsed or released holds

**Decision:** `commitOrderReservations` re-checks stock and commits if a hold lapsed or was released before the payment was captured. If someone else bought the piece, it changes nothing and returns `stock_unavailable`; the payments module (M4) will flag the order `needs_resolution` and refund.

**Caller contract:** never call it for a cancelled order. Check order status first, under the order row lock.

## 2026-10-19 — Cache Components on

**Decision:** Keep Next 16's default `cacheComponents: true`. Catalogue reads use `"use cache"` with the `catalog` tag; live stock on the product page is read uncached inside `<Suspense>`.

**Consequences:** Admin edits and committed sales must call `revalidateTag("catalog")`. The listing's "Sold" badge reflects committed sales, not active holds; the product page shows live availability. A missing product renders the not-found page inside a streamed response, so the HTTP status is 200 (Next adds `noindex`). Revisit if this matters for SEO.

## 2026-10-19 — Fonts self-hosted

**Decision:** The three OFL font families are committed in `src/fonts` and loaded with `next/font/local`. Builds never depend on Google Fonts.

## 2026-10-19 — Working assumptions pending Krishna's answers

- Each launch piece is one of one: one product, one variant, `on_hand = 1`. The model supports multiple sizes and quantities if not.
- COD is off by default (`store_settings.cod_enabled = false`) until the COD policy is decided.
- Policy pages are drafts and say so on the page.
