CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" varchar(40) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"hit_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_hits_bucket_key_hit_idx" ON "rate_limit_hits" USING btree ("bucket","key_hash","hit_at");