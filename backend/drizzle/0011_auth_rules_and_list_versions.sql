CREATE TABLE "pair_claim_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"failed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_config_versions" DROP CONSTRAINT "child_config_versions_positive";--> statement-breakpoint
ALTER TABLE "child_config_versions" ALTER COLUMN "version" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "child_config_versions" ADD COLUMN "test_periods_changed_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "child_config_versions" ADD COLUMN "blank_periods_changed_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_claim_failures" ADD CONSTRAINT "pair_claim_failures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pair_claim_failures_user_failed_idx" ON "pair_claim_failures" USING btree ("user_id","failed_at");--> statement-breakpoint
ALTER TABLE "child_config_versions" ADD CONSTRAINT "child_config_versions_nonnegative" CHECK ("child_config_versions"."version" >= 0);--> statement-breakpoint