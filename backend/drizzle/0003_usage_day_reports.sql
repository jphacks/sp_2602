ALTER TABLE "usage_sync_batches" ADD COLUMN "applied_dates" date[] DEFAULT '{}'::date[] NOT NULL;--> statement-breakpoint
CREATE TABLE "usage_day_reports" (
	"submission_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"restricted_minutes" integer NOT NULL,
	CONSTRAINT "usage_day_reports_submission_date_pk" PRIMARY KEY("submission_id","usage_date"),
	CONSTRAINT "usage_day_reports_restricted_minutes_nonnegative" CHECK ("usage_day_reports"."restricted_minutes" >= 0)
);--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "label" varchar(120);--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "excluded" boolean;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "record_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT "usage_records_submission_date_app_pk";--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_pkey" PRIMARY KEY("record_id");--> statement-breakpoint
ALTER TABLE "usage_day_reports" ADD CONSTRAINT "usage_day_reports_submission_child_fk" FOREIGN KEY ("submission_id","child_id") REFERENCES "public"."usage_sync_batches"("submission_id","child_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_day_report_fk" FOREIGN KEY ("submission_id","usage_date") REFERENCES "public"."usage_day_reports"("submission_id","usage_date") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "usage_day_reports_child_date_measured_idx" ON "usage_day_reports" USING btree ("child_id","usage_date","measured_at");
