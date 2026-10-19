CREATE TYPE "public"."chapter_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" smallint NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" varchar(80) NOT NULL,
	"subtitle" varchar(200),
	"letter" text DEFAULT '' NOT NULL,
	"letter_signature" varchar(60),
	"cover_image_url" text,
	"cover_image_alt" varchar(240),
	"tone" varchar(7),
	"status" "chapter_status" DEFAULT 'draft' NOT NULL,
	"release_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_number_unique" UNIQUE("number"),
	CONSTRAINT "chapters_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chapters_number_pos" CHECK ("chapters"."number" > 0),
	CONSTRAINT "chapters_tone_hex" CHECK ("chapters"."tone" is null or "chapters"."tone" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "chapters_published_has_release" CHECK ("chapters"."status" <> 'published' or "chapters"."release_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "chapters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "share_city_in_archive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "piece_number" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "piece_name" varchar(60);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "story" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "styling_note" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tone" varchar(7);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "concierge_name" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_chapter_idx" ON "products" USING btree ("chapter_id","piece_number");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_piece_number_unique" UNIQUE("piece_number");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_piece_number_pos" CHECK ("products"."piece_number" is null or "products"."piece_number" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tone_hex" CHECK ("products"."tone" is null or "products"."tone" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_whatsapp_digits" CHECK ("store_settings"."support_whatsapp" is null or "store_settings"."support_whatsapp" ~ '^[0-9]{10,15}$');