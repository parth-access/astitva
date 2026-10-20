CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_alerts_waiting_uq" ON "stock_alerts" USING btree ("variant_id","email") WHERE "stock_alerts"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "stock_alerts_waiting_idx" ON "stock_alerts" USING btree ("variant_id") WHERE "stock_alerts"."notified_at" is null;