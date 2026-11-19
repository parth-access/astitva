ALTER TABLE "store_settings" ADD COLUMN "about_intro" varchar(200);--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "about_body" text DEFAULT '' NOT NULL;