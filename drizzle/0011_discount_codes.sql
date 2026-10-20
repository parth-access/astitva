CREATE TYPE "public"."discount_kind" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"one_per_phone" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" varchar(200),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_codes_code_format" CHECK ("discount_codes"."code" ~ '^[A-Z0-9-]{3,32}$'),
	CONSTRAINT "discount_codes_value" CHECK (("discount_codes"."kind" = 'percent' and "discount_codes"."value" between 1 and 9000) or ("discount_codes"."kind" = 'amount' and "discount_codes"."value" > 0)),
	CONSTRAINT "discount_codes_min_nonneg" CHECK ("discount_codes"."min_subtotal_minor" >= 0),
	CONSTRAINT "discount_codes_uses" CHECK ("discount_codes"."uses_count" >= 0 and ("discount_codes"."max_uses" is null or ("discount_codes"."max_uses" > 0 and "discount_codes"."uses_count" <= "discount_codes"."max_uses"))),
	CONSTRAINT "discount_codes_window" CHECK ("discount_codes"."starts_at" is null or "discount_codes"."ends_at" is null or "discount_codes"."starts_at" < "discount_codes"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null ON UPDATE no action;