CREATE TABLE "rail_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"color" varchar(48),
	"side" varchar(5) NOT NULL,
	"source_url" text NOT NULL,
	"url" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rail_photos_side" CHECK ("rail_photos"."side" in ('front', 'back'))
);
--> statement-breakpoint
ALTER TABLE "rail_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rail_photos" ADD CONSTRAINT "rail_photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rail_photos_colour_side_uq" ON "rail_photos" USING btree ("product_id",coalesce("color", ''),"side");