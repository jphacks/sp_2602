CREATE TYPE "public"."user_role" AS ENUM('parent', 'child');--> statement-breakpoint
CREATE TABLE "excluded_apps" (
	"child_id" uuid NOT NULL,
	"app_id" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excluded_apps_pk" PRIMARY KEY("child_id","app_id"),
	CONSTRAINT "excluded_apps_app_id_not_blank" CHECK (length(trim("excluded_apps"."app_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "child_config_versions" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_config_versions_positive" CHECK ("child_config_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "family_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"parent_role" "user_role" DEFAULT 'parent' NOT NULL,
	"child_id" uuid NOT NULL,
	"child_role" "user_role" DEFAULT 'child' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_links_parent_child_unique" UNIQUE("parent_id","child_id"),
	CONSTRAINT "family_links_parent_role_is_parent" CHECK ("family_links"."parent_role" = 'parent'),
	CONSTRAINT "family_links_child_role_is_child" CHECK ("family_links"."child_role" = 'child'),
	CONSTRAINT "family_links_no_self_link" CHECK ("family_links"."parent_id" <> "family_links"."child_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"display_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_id_role_unique" UNIQUE("id","role")
);
--> statement-breakpoint
CREATE TABLE "daily_limits" (
	"child_id" uuid NOT NULL,
	"limit_date" date NOT NULL,
	"limit_minutes" integer NOT NULL,
	"calculation_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_limits_pk" PRIMARY KEY("child_id","limit_date"),
	CONSTRAINT "daily_limits_child_date_version_unique" UNIQUE("child_id","limit_date","calculation_version"),
	CONSTRAINT "daily_limits_minutes_nonnegative" CHECK ("daily_limits"."limit_minutes" >= 0),
	CONSTRAINT "daily_limits_version_positive" CHECK ("daily_limits"."calculation_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_calculation_versions" (
	"child_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_config_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_calculation_versions_pk" PRIMARY KEY("child_id","version"),
	CONSTRAINT "plan_calculation_versions_positive" CHECK ("plan_calculation_versions"."version" > 0),
	CONSTRAINT "plan_calculation_source_version_positive" CHECK ("plan_calculation_versions"."source_config_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_settings" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"plan_start_date" date NOT NULL,
	"start_limit_minutes" integer NOT NULL,
	"final_goal_minutes" integer NOT NULL,
	"usual_limit_minutes" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_settings_start_limit_nonnegative" CHECK ("plan_settings"."start_limit_minutes" >= 0),
	CONSTRAINT "plan_settings_final_goal_nonnegative" CHECK ("plan_settings"."final_goal_minutes" >= 0),
	CONSTRAINT "plan_settings_usual_limit_nonnegative" CHECK ("plan_settings"."usual_limit_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "test_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_periods_name_not_blank" CHECK (length(trim("test_periods"."name")) > 0),
	CONSTRAINT "test_periods_end_not_before_start" CHECK ("test_periods"."end_date" >= "test_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"submission_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"app_id" varchar(255) NOT NULL,
	"used_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_submission_date_app_pk" PRIMARY KEY("submission_id","usage_date","app_id"),
	CONSTRAINT "usage_records_minutes_nonnegative" CHECK ("usage_records"."used_minutes" >= 0),
	CONSTRAINT "usage_records_app_id_not_blank" CHECK (length(trim("usage_records"."app_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_sync_batches" (
	"submission_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_sync_batches_pk" PRIMARY KEY("submission_id"),
	CONSTRAINT "usage_sync_batches_submission_child_unique" UNIQUE("submission_id","child_id"),
	CONSTRAINT "usage_sync_batches_payload_hash_not_blank" CHECK (length("usage_sync_batches"."payload_hash") > 0)
);
--> statement-breakpoint
ALTER TABLE "excluded_apps" ADD CONSTRAINT "excluded_apps_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excluded_apps" ADD CONSTRAINT "excluded_apps_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_config_versions" ADD CONSTRAINT "child_config_versions_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_parent_role_fk" FOREIGN KEY ("parent_id","parent_role") REFERENCES "public"."users"("id","role") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_child_role_fk" FOREIGN KEY ("child_id","child_role") REFERENCES "public"."users"("id","role") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_limits" ADD CONSTRAINT "daily_limits_calculation_version_fk" FOREIGN KEY ("child_id","calculation_version") REFERENCES "public"."plan_calculation_versions"("child_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_calculation_versions" ADD CONSTRAINT "plan_calculation_versions_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_periods" ADD CONSTRAINT "test_periods_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_periods" ADD CONSTRAINT "test_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_submission_child_fk" FOREIGN KEY ("submission_id","child_id") REFERENCES "public"."usage_sync_batches"("submission_id","child_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_sync_batches" ADD CONSTRAINT "usage_sync_batches_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_links_child_idx" ON "family_links" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "test_periods_child_start_idx" ON "test_periods" USING btree ("child_id","start_date");--> statement-breakpoint
CREATE INDEX "usage_records_child_date_app_idx" ON "usage_records" USING btree ("child_id","usage_date","app_id");--> statement-breakpoint
CREATE INDEX "usage_sync_batches_child_received_idx" ON "usage_sync_batches" USING btree ("child_id","received_at");