-- Colours: a swatch per variant colour, photos tied to a colour.
ALTER TABLE "product_images" ADD COLUMN "color" varchar(48);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "color_hex" varchar(7);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_color_hex" CHECK ("product_variants"."color_hex" is null or "product_variants"."color_hex" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
-- The home page lookbook is configured once in store settings, not per chapter.
ALTER TABLE "store_settings" ADD COLUMN "ordering_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "lookbook_title" varchar(80);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "lookbook_subtitle" varchar(200);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "note_signature" varchar(60);--> statement-breakpoint
-- Keep the newest chapter's words: its title, line and letter become the lookbook's.
UPDATE "store_settings" s SET
  "lookbook_title" = c."title",
  "lookbook_subtitle" = c."subtitle",
  "note" = c."letter",
  "note_signature" = c."letter_signature"
FROM (SELECT * FROM "chapters" ORDER BY "number" DESC LIMIT 1) c
WHERE s."id" = 1;--> statement-breakpoint
-- Chapters are gone.
ALTER TABLE "products" DROP CONSTRAINT "products_chapter_id_chapters_id_fk";--> statement-breakpoint
DROP INDEX "products_chapter_idx";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "chapter_id";--> statement-breakpoint
DROP TABLE "chapters";--> statement-breakpoint
DROP TYPE "public"."chapter_status";
