# Decisions

Short records of choices that differ from, or add to, the revised PRD. Newest first.

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
