# Astitva

E-commerce platform for **Astitva — Your True Form**, Krishna's womenswear brand. One Next.js app, one Postgres database.

The specification is the revised PRD (Astitva PRD Review and Revised Specification). Decisions that differ from it are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Status

| Milestone | State |
| --- | --- |
| M0 Foundation: repo, schema, tokens, CI-ready scripts | Done |
| M1 Catalogue: storefront as a lookbook (chapters, numbered pieces, archive, concierge) | Storefront done. Admin and auth not started |
| M2 Inventory engine: reservations, movements, state machines | Done, with concurrency tests |
| M3 Cart, guest checkout, COD | Not started |
| M4 Razorpay | Not started |
| M5 Fulfilment and refunds | Not started |
| M6 Hardening and launch | Not started |

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

The app connects as the database owner. Every table has row-level security on with no policies, and the Supabase `anon` and `authenticated` roles have no privileges, so the Supabase Data API and anon key cannot read or change store data. Don't use `supabase-js` against these tables.

Later, on Vercel, use the **Transaction pooler** string (port 6543) and paste the certificate's contents into `DATABASE_CA_CERT`.

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

## Layout

```
src/
  app/(store)/        storefront pages
  app/api/health/     uptime check
  components/         UI (storefront/)
  components/brand/   the lookbook: plates, spreads, chapter cover, letter, archive, concierge, first-visit intro
assets/brand/         the logo source the mascot assets are generated from
scripts/mascot/       mascot pipeline: python3 scripts/mascot/build.py
  content/            policy drafts and brand promises (must be confirmed before launch)
  db/schema.ts        the whole data model, with CHECK and UNIQUE constraints
  lib/                money (integer paise), state machines, sizes, env
  modules/
    catalog/          cached storefront reads
    inventory/        reservation engine: the only code that changes stock
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

## Before launch

Search the code for `TODO(launch)` and `TODO(brand)`. Brand colours in `src/app/globals.css` are placeholders until the final logo files arrive.
