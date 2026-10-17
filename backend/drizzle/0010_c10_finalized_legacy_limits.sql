ALTER TABLE "daily_limits" DROP CONSTRAINT IF EXISTS "daily_limits_limit_shape";--> statement-breakpoint
ALTER TABLE "daily_limits" ADD COLUMN "is_finalized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_limits" DROP CONSTRAINT IF EXISTS "daily_limits_minutes_range";--> statement-breakpoint
UPDATE "daily_limits" SET "is_finalized" = true WHERE "limit_minutes" < 0 OR "limit_minutes" > 1440;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_minutes_range" CHECK ("daily_limits"."is_finalized" OR ("daily_limits"."limit_minutes" >= 0 AND "daily_limits"."limit_minutes" <= 1440)) NOT VALID;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_limit_shape" CHECK ((
    "daily_limits"."limit_kind" = 'limited' AND "daily_limits"."limit_minutes" IS NOT NULL AND "daily_limits"."blank_period_id" IS NULL
  ) OR (
    "daily_limits"."limit_kind" = 'unlimited' AND "daily_limits"."limit_minutes" IS NULL AND "daily_limits"."blank_period_id" IS NOT NULL
  )) NOT VALID;
