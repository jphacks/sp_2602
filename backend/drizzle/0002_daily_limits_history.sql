ALTER TABLE "daily_limits" DROP CONSTRAINT "daily_limits_pk";--> statement-breakpoint
ALTER TABLE "daily_limits" DROP CONSTRAINT "daily_limits_child_date_version_unique";--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_pk" PRIMARY KEY("child_id","limit_date","calculation_version");
