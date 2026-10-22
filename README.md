# Astitva

E-commerce platform for **Astitva — Your True Form**, Krishna's womenswear brand. One Next.js app, one Postgres database.

The specification is the revised PRD (Astitva PRD Review and Revised Specification). Decisions that differ from it are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Status

| Milestone | State |
| --- | --- |
| M0 Foundation: repo, schema, tokens, CI-ready scripts | Done |
| M1 Catalogue: the lookbook storefront, styles in colours × sizes, admin | Done: storefront lookbook, admin sign-in (password + required 2FA), style editor with colour × size stock grid, photos on Cloudinary, lookbook settings, colour and size choice across the storefront |
| M2 Inventory engine: reservations, movements, state machines | Done, with concurrency tests |
| M3 Cart, guest checkout, COD | Done: bag drawer, one-page guest checkout, cash on delivery with WhatsApp confirmation, buyer's private order page, admin Orders (confirm, cancel), delivery and COD settings. Order emails are queued until Resend is set up |
| M4 Razorpay | Built and tested against a stand-in Razorpay: pay now at checkout (stock held 15 minutes), signature and server-side checks, webhook, late-payment flags. Needs test keys to try the real window; live keys once Krishna's current account is verified |
| M5 Fulfilment and refunds | Done: pack, ship with courier and tracking, delivered, came back (RTO, stock returned), COD cash remitted, refunds through Razorpay or recorded UPI/bank, flags for Krishna, tracking on the buyer's order page. Shipping emails are queued until Resend is set up |
| M6 Hardening and launch | In progress: owner alerts and buyer emails (queued, sent through Resend, retried), scheduled jobs and encrypted nightly backups (GitHub Actions), abuse limits, error alerts, security headers, sitemap and robots. Left: policies, business details, deploy, live keys |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS 4 · Drizzle ORM + `pg` · Zod · Vitest.

## Getting started

Requires Node 20+.

```bash
npm install            # if npm crashes with "reading 'edgesOut'", re-run with --legacy-peer-deps
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

Without `RESEND_API_KEY` the link is printed in the terminal instead of emailed. On first sign-in at `/admin`, each admin sets up a 6-digit code in an authenticator app; nothing else in the admin opens until they do. Running the command again for an existing admin sends a fresh link (a password reset).

The app connects as the database owner. Every table has row-level security on with no policies, and the Supabase `anon` and `authenticated` roles have no privileges, so the Supabase Data API and anon key cannot read or change store data. Don't use `supabase-js` against these tables.

Later, on Netlify, use the **Transaction pooler** string (port 6543) and paste the certificate's contents into `DATABASE_CA_CERT`.

### Tests

Integration tests need a local throwaway Postgres in `DATABASE_URL_TEST` (they wipe it). With Homebrew: `brew install postgresql@16 && brew services start postgresql@16 && createdb astitva_test`. CI runs them on its own Postgres.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run check` | Typecheck, lint and all tests. Run before every commit. |
| `npm test` | Unit and integration tests. Integration tests need `DATABASE_URL_TEST` and **wipe that database**. |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts`. Review the SQL before committing. |
| `npm run db:migrate` | Apply pending migrations. |
| `npm run db:studio` | Browse the database. |
| `npm run admin:create` | Create an admin, or send an existing one a new password link. |

## Layout

```
src/
  app/(store)/        storefront pages
  app/admin/          admin: (auth) sign-in pages, (panel) everything behind requireAdmin()
  proxy.ts            sends signed-out visitors of /admin to the login page (a shortcut, not the check)
  app/api/health/     uptime check
  components/         UI (storefront/)
  components/brand/   plates, painted sketches, letter, concierge, first-visit intro
  components/lookbook/ the home page lookbook and loading skeletons
assets/brand/         the logo source the mascot assets are generated from
scripts/mascot/       mascot pipeline: python3 scripts/mascot/build.py
  content/            policy drafts and brand promises (must be confirmed before launch)
  db/schema.ts        the whole data model, with CHECK and UNIQUE constraints
  lib/                money (integer paise), state machines, sizes, env
  modules/
    auth/             sign-in (Better Auth): the admin's (password + 2FA, requireAdmin()) and customers' (password, email code or Google, getCustomer()), kept apart by session kind
    catalog/          cached storefront reads
    catalog-admin/    admin reads and writes for pieces (includes private fields; never import from storefront)
    inventory/        reservation engine: the only code that changes stock
    media/            Cloudinary: signed uploads, reply checks, deletes
    orders/           order, payment, COD, refund state machines
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
| `APP_URL` | The live address, e.g. `https://astitva.in` (no trailing slash) |
| `BETTER_AUTH_SECRET` ✱ | New `openssl rand -base64 32`; changing it signs everyone out and breaks old order links |
| `CLOUDINARY_URL` ✱ | `cloudinary://…` |
| `RESEND_API_KEY` ✱, `EMAIL_FROM` | Resend key; sender on the verified domain, e.g. `Astitva <hello@astitva.in>` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` ✱ | Test keys until the account is live; without them checkout offers COD only |
| `RAZORPAY_WEBHOOK_SECRET` ✱ | Same value as the webhook in Razorpay's dashboard |
| `CRON_SECRET` ✱ | Same value as the GitHub secret `CRON_SECRET` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ✱ | Optional: "Sign in with Google" for customers. A Web client in Google Cloud with redirect URI `https://<live address>/api/account/callback/google`; without them customers sign in by email code only |

Don't set `NODE_ENV` (Netlify does), `DATABASE_CA_CERT_FILE` or `DATABASE_URL_TEST` (local only), or `SHOW_DRAFT_COPY` (review deploys only). The build reads the catalogue to prerender pages, so the database and Cloudinary variables must reach builds as well as functions (Netlify's default "all scopes"). Run migrations yourself before deploying a change that needs them.

## Scheduled jobs and backups

Two GitHub workflows, both skip quietly until their settings exist:

- `.github/workflows/scheduled.yml` calls `/api/cron/frequent` every 15 minutes (send and retry emails, close online checkouts unpaid after 2 hours, mark lapsed holds) and `/api/cron/daily` once a day (expired bags, old limit counters; the call also keeps the free Supabase project from pausing). Set the repository **variable** `SITE_URL` and **secret** `CRON_SECRET` (same value as the site's `CRON_SECRET`).
- `.github/workflows/backup.yml` dumps the database nightly, encrypts it with `BACKUP_PASSPHRASE` and keeps it 30 days as a workflow download. Secrets: `BACKUP_DATABASE_URL`, `DATABASE_CA_CERT`, `BACKUP_PASSPHRASE`. The repository is public: backups are only ever stored encrypted. Keep the passphrase in the password manager; without it the backups can't be read.

GitHub pauses scheduled workflows after 60 days without activity in the repository; a push turns them back on.

**Restore** (into an empty database, or a fresh Supabase project):

```bash
gpg --decrypt astitva-YYYY-MM-DD.dump.gpg > astitva.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" astitva.dump
```

## Before launch

Search the code for `TODO(launch)` and `TODO(brand)`. Brand colours in `src/app/globals.css` are placeholders until the final logo files arrive.
