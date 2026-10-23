CREATE SEQUENCE "public"."receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" varchar(16) DEFAULT 'ASTR-' || lpad(nextval('receipt_number_seq')::text, 6, '0') NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_with" varchar(24),
	"provider_payment_id" varchar(64),
	"paid_at" timestamp with time zone,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_receipt_number_unique" UNIQUE("receipt_number"),
	CONSTRAINT "receipts_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "receipts_amount_pos" CHECK ("receipts"."amount_minor" > 0),
	CONSTRAINT "receipts_online_paid" CHECK ("receipts"."payment_method" = 'cod' or "receipts"."paid_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;