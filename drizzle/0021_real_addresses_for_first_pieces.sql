-- The first three pieces were made by editing the sample products and kept their
-- addresses: a sweater at /pieces/neem-linen-wrap-dress. next.config.ts redirects the old ones.
UPDATE "products" SET "slug" = 'the-muse-knit' WHERE "slug" = 'neem-linen-wrap-dress';--> statement-breakpoint
UPDATE "products" SET "slug" = 'the-cloud-comfort' WHERE "slug" = 'saanjh-knit-co-ord-set';--> statement-breakpoint
UPDATE "products" SET "slug" = 'the-good-mood-club' WHERE "slug" = 'kahwa-tailored-blazer';
