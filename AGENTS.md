<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Astitva project rules

Read `README.md` and `docs/DECISIONS.md` first.

- Money is integer paise (`src/lib/money.ts`). Never use floats for amounts.
- Only `src/modules/inventory/service.ts` may change `product_variants.on_hand`. Every change writes one `inventory_movements` row in the same transaction.
- Every status change goes through a machine in `src/modules/orders/machines.ts`.
- Never trust the browser for price, stock or payment status. Re-price on the server.
- Never select supplier, acquisition cost or internal ref in storefront code (`src/modules/catalog`).
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, read the SQL, commit it.
- Run `npm run check` before committing. Integration tests need `DATABASE_URL_TEST` and wipe that database.
- Commit as `Parth <parthsaarthichhikara@gmail.com>` (e.g. `git -c user.name=Parth -c user.email=parthsaarthichhikara@gmail.com commit ...`). Never add `Co-Authored-By` or any other AI/Claude trailer, and never commit under a Claude or bot identity.
