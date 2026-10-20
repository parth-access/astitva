CREATE TABLE "request_limits" (
	"key" varchar(96) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_limits" ENABLE ROW LEVEL SECURITY;