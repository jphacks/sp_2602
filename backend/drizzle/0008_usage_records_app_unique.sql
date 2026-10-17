ALTER TABLE "daily_limits" DROP CONSTRAINT "daily_limits_minutes_nonnegative";--> statement-breakpoint
ALTER TABLE "plan_settings" DROP CONSTRAINT "plan_settings_start_limit_nonnegative";--> statement-breakpoint
ALTER TABLE "plan_settings" DROP CONSTRAINT "plan_settings_final_goal_nonnegative";--> statement-breakpoint
ALTER TABLE "plan_settings" DROP CONSTRAINT "plan_settings_usual_limit_nonnegative";--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_submission_date_app_unique" UNIQUE("submission_id","usage_date","app_id");--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_minutes_range" CHECK ("daily_limits"."limit_minutes" >= 0 AND "daily_limits"."limit_minutes" <= 1440) NOT VALID;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_start_limit_range" CHECK ("plan_settings"."start_limit_minutes" >= 0 AND "plan_settings"."start_limit_minutes" <= 1440) NOT VALID;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_final_goal_range" CHECK ("plan_settings"."final_goal_minutes" >= 0 AND "plan_settings"."final_goal_minutes" <= 1440) NOT VALID;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_usual_limit_range" CHECK ("plan_settings"."usual_limit_minutes" >= 0 AND "plan_settings"."usual_limit_minutes" <= 1440) NOT VALID;
