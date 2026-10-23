# Astitva

E-commerce platform for **Astitva — Your True Form**, Krishna's womenswear brand. One Next.js app, one Postgres database. Live at [astitva.store](https://astitva.store) (Netlify, Supabase).

The specification is the revised PRD (Astitva PRD Review and Revised Specification). Decisions that differ from it are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Status

| Milestone | State |
| --- | --- |
| M0 Foundation: repo, schema, tokens, CI-ready scripts | Done |
| M1 Catalogue: the lookbook storefront, styles in colours × sizes, admin | Done: storefront lookbook, admin sign-in (password + required 2FA), style editor with colour × size stock grid, photos on Cloudinary, lookbook settings, colour and size choice across the storefront |
| M2 Inventory engine: reservations, movements, state machines | Done, with concurrency tests |
| M3 Cart, guest checkout, COD | Done: bag drawer, one-page guest checkout, cash on delivery (no confirmation call for now; at most 2 unpacked COD orders per mobile), buyer's private order page, admin Orders, delivery and COD settings |
| M4 Razorpay | Done, in test mode: pay now at checkout (stock held 15 minutes), signature and server-side checks, webhook, late-payment flags. Test keys (`rzp_test_…`) show "Test mode" at checkout; live keys once Krishna's current account is verified |
| M5 Fulfilment and refunds | Done: pack, ship with courier and tracking, delivered, came back (RTO, stock returned), COD cash remitted, refunds through Razorpay or recorded UPI/bank, flags for Krishna, tracking on the buyer's order page. Order and shipping emails sent through Resend |
| M6 Hardening and launch | In progress: deployed on Netlify; owner alerts and buyer emails (sent through Resend, retried), scheduled jobs and encrypted nightly backups (GitHub Actions), abuse limits, error alerts, security headers, sitemap and robots, a loading bar on every page change. Left: final policies, business details, live Razorpay keys |
| Customer accounts | Done: sign up (name, mobile, email, password); sign in by password, a 6-digit email code or Google; verify the email with a code; forgot password; orders, saved addresses (offered at checkout, which also fills in the account's details), saved pieces (hearts), details, sign out everywhere, delete the account. The bag follows the account across devices. Guest checkout stays |
| Receipts | Done: a numbered receipt for every order (online once paid; cash on delivery when placed, "to pay on delivery"), sent as a PDF with the confirmation email and shown on the order page, the account's orders and a printable receipt page |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS 4 · Drizzle ORM + `pg` · Zod · Vitest.

## Getting started

Requires Node 20+.

```bash
npm install            # .npmrc sets legacy-peer-deps, so this matches CI and Netlify
cp .env.example .env
cp .env.example .env.local
```

### Database: Supabase

1. In the Supabase dashboard open **Connect** and copy the **Session pooler** connection string. Put it in `DATABASE_URL` in both env files, with your database password filled in. Do not add `?sslmode=`.
2. Open **Project Settings → Database → SSL configuration** and download the certificate. Save it as `certs/supabase-ca.crt` in this folder (git-ignored).
3. Create the tables and load the sample products:

```bash
npm run db:migrate
npm run db:seed        # SAMPLE products only (refuses to run in production)
npm run dev
```

### Admin accounts

There is no public sign-up. Create an admin, and send them a link to set their password:

```bash
npm run admin:create -- --email krishna@example.com --name "Krishna"
```

Without `RESEND_API_KEY` the link is printed in the terminal instead of emailed (so are customers' sign-in and verification codes, which makes local testing easy). On first sign-in at `/admin`, each admin sets up a 6-digit code in an authenticator app; nothing else in the admin opens until they do. Running the command again for an existing admin sends a fresh link (a password reset).

The app connects as the database owner. Every table has row-level security on with no policies, and the Supabase `anon` and `authenticated` roles have no privileges, so the Supabase Data API and anon key cannot read or change store data. Don't use `supabase-js` against these tables.

Later, on Netlify, use the **Transaction pooler** string (port 6543) and paste the certificate's contents into `DATABASE_CA_CERT`.

### Tests

Integration tests need a local throwaway Postgres in `DATABASE_URL_TEST` (they wipe it). With Homebrew: `brew install postgresql@16 && brew services start postgresql@16 && createdb astitva_test`. CI (`.github/workflows/ci.yml`, on pushes to main and on pull requests) runs the typecheck, lint and tests on its own Postgres, then a build. It installs with `npm ci`, so commit `package-lock.json` whenever `package.json` changes.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run check` | Typecheck, lint and all tests. Run before every commit. |
| `npm run typecheck` | Generates Next's route types (`PageProps`, `LayoutProps`), then runs `tsc`. |
| `npm test` | Unit and integration tests. Integration tests need `DATABASE_URL_TEST` and **wipe that database**. |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts`. Review the SQL before committing. |
| `npm run db:migrate` | Apply pending migrations. |
| `npm run db:studio` | Browse the database. |
| `npm run admin:create` | Create an admin, or send an existing one a new password link. |

## Layout

```
src/
  app/(store)/        storefront pages, including account/ (sign in, sign up, orders, saved pieces, addresses, details)
  app/admin/          admin: (auth) sign-in pages, (panel) everything behind requireAdmin()
  app/api/            account/ and auth/ (Better Auth), cron/ (scheduled jobs), webhooks/razorpay, health/
  proxy.ts            sends signed-out visitors of /admin and /account to sign in (a shortcut, not the check)
  components/         UI (storefront/, admin/)
  components/brand/   plates, painted sketches, letter, concierge, first-visit intro, page loading bar
  components/lookbook/ the home page lookbook and loading skeletons
  content/            policy drafts and brand promises (must be confirmed before launch)
  db/schema.ts        the whole data model, with CHECK and UNIQUE constraints
  lib/                money (integer paise), state machines, sizes, env
  modules/
    account/          customer accounts: orders, addresses, details, saved pieces
    alerts/           back-in-stock alerts
    auth/             sign-in (Better Auth): the admin's (password + 2FA, requireAdmin()) and customers' (password, email code or Google, getCustomer()), kept apart by session kind
    bag/              the bag: a guest's against a cookie, a customer's with their account
    catalog/          cached storefront reads
    catalog-admin/    admin reads and writes for pieces (includes private fields; never import from storefront)
    checkout/         pricing and placing orders (prices always from the database)
    discounts/        discount codes
    email/            templates and the outbox (queued, sent, retried)
    inventory/        reservation engine: the only code that changes stock
    jobs/             what the scheduled jobs do
    limits/           abuse limits per visitor, mobile or email
    media/            Cloudinary: signed uploads, reply checks, deletes
    orders/           order, payment, COD, refund state machines; fulfilment
    payments/         Razorpay: payments, webhook, refunds
    receipts/         numbered receipts, frozen at issue; the PDF
assets/brand/         the logo source the mascot assets are generated from
scripts/mascot/       mascot pipeline: python3 scripts/mascot/build.py
drizzle/              SQL migrations (generated, reviewed, committed)
tests/unit/           pure logic
tests/integration/    against a real Postgres, incl. the 50-buyer race test
```

## Rules that keep the money and stock right

1. Money is integer paise. Never floats. Prices are tax-inclusive.
2. Only `modules/inventory` changes `on_hand`, and each change writes one `inventory_movements` row in the same transaction.
3. Status changes go through the machines in `modules/orders/machines.ts`.
4. The browser never decides price, stock or payment status.
5. Products and variants are archived, never deleted.

## Deploying on Netlify

Build settings are in `netlify.toml` (Node 22, `npm run build`) and `.npmrc`. In **Site configuration → Environment variables** add (✱ = mark as secret):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` ✱ | Supabase **transaction pooler** string (port 6543) |
| `DATABASE_CA_CERT` ✱ | Full text of Supabase's `prod-ca-2021.crt` |
| `APP_URL` | The live address, `https://astitva.store` (no trailing slash) |
| `BETTER_AUTH_SECRET` ✱ | New `openssl rand -base64 32`; changing it signs everyone out and breaks old order links |
| `CLOUDINARY_URL` ✱ | `cloudinary://…` |
| `RESEND_API_KEY` ✱, `EMAIL_FROM` | Resend key; sender on the domain verified in Resend, e.g. `Astitva <hello@…>` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` ✱ | Test keys until the account is live; without them checkout offers COD only |
| `RAZORPAY_WEBHOOK_SECRET` ✱ | Same value as the webhook in Razorpay's dashboard |
| `CRON_SECRET` ✱ | Same value as the GitHub secret `CRON_SECRET` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ✱ | Optional: "Sign in with Google" for customers. A Web client in Google Cloud with redirect URI `https://<live address>/api/account/callback/google`; without them customers sign in by password or email code |

Don't set `NODE_ENV` (Netlify does), `DATABASE_CA_CERT_FILE` or `DATABASE_URL_TEST` (local only), or `SHOW_DRAFT_COPY` (review deploys only). The build reads the catalogue to prerender pages, so the database and Cloudinary variables must reach builds as well as functions (Netlify's default "all scopes"). Run migrations yourself before deploying a change that needs them.

## Scheduled jobs and backups

Two GitHub workflows, both skip quietly until their settings exist:

- `.github/workflows/scheduled.yml` calls `/api/cron/frequent` every 15 minutes (send and retry emails, close online checkouts unpaid after 2 hours, mark lapsed holds) and `/api/cron/daily` once a day (expired bags, old limit counters; the call also keeps the free Supabase project from pausing). The frequent job also emails back-in-stock alerts for stock freed by unpaid checkouts. Needs `SITE_URL` (the live address; a repository variable or a secret) and the secret `CRON_SECRET` (same value as the site's `CRON_SECRET`; after changing it on Netlify, redeploy). Run it by hand from **Actions → Scheduled jobs → Run workflow** to check the setup.
- `.github/workflows/backup.yml` dumps the database nightly, encrypts it with `BACKUP_PASSPHRASE` and keeps it 30 days as a workflow download. Secrets: `BACKUP_DATABASE_URL`, `DATABASE_CA_CERT`, `BACKUP_PASSPHRASE`. The repository is public: backups are only ever stored encrypted. Keep the passphrase in the password manager; without it the backups can't be read.

GitHub pauses scheduled workflows after 60 days without activity in the repository; a push turns them back on.

**Restore** (into an empty database, or a fresh Supabase project):

```bash
gpg --decrypt astitva-YYYY-MM-DD.dump.gpg > astitva.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" astitva.dump
```

## Before launch

Search the code for `TODO(launch)` and `TODO(brand)`. The brand colours in `src/app/globals.css` are confirmed; the final logo files are still to come. Also left: final policies (still drafts, kept out of search), business details (GSTIN), live Razorpay keys, and the old unused Google client secret to disable in Google Cloud.
