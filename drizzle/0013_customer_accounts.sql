CREATE TYPE "public"."session_kind" AS ENUM('admin', 'customer');--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_name" varchar(120) NOT NULL,
	"phone" varchar(16) NOT NULL,
	"line1" varchar(200) NOT NULL,
	"line2" varchar(200),
	"landmark" varchar(120),
	"city" varchar(80) NOT NULL,
	"state" varchar(80) NOT NULL,
	"pincode" varchar(6) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_pieces" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_pieces_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "saved_pieces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Sessions that exist now were all made by the admin sign-in. The default fills them, then goes:
-- every new session must say which sign-in made it.
ALTER TABLE "auth_sessions" ADD COLUMN "kind" "session_kind" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_pieces" ADD CONSTRAINT "saved_pieces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_pieces" ADD CONSTRAINT "saved_pieces_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_user_idx" ON "customer_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_default_uq" ON "customer_addresses" USING btree ("user_id") WHERE "customer_addresses"."is_default";--> statement-breakpoint
CREATE INDEX "saved_pieces_user_created_idx" ON "saved_pieces" USING btree ("user_id","created_at" DESC NULLS LAST);