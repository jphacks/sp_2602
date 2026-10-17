-- Preserve historical D6 values, including rows predating the current 0..1440 cap.
-- PostgreSQL enforces NOT VALID constraints for new rows without scanning/rejecting old snapshots.
ALTER TABLE "daily_limits" ALTER COLUMN "limit_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD COLUMN "limit_kind" varchar(16) DEFAULT 'limited' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD COLUMN "blank_period_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_kind_value" CHECK ("daily_limits"."limit_kind" IN ('limited', 'unlimited')) NOT VALID;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_limit_shape" CHECK ((
    "daily_limits"."limit_kind" = 'limited' AND "daily_limits"."limit_minutes" >= 0 AND "daily_limits"."limit_minutes" <= 1440 AND "daily_limits"."blank_period_id" IS NULL
  ) OR (
    "daily_limits"."limit_kind" = 'unlimited' AND "daily_limits"."limit_minutes" IS NULL AND "daily_limits"."blank_period_id" IS NOT NULL
  )) NOT VALID;
