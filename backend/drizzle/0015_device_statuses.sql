CREATE TABLE "device_statuses" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"usage_access" boolean NOT NULL,
	"overlay" boolean NOT NULL,
	"notifications" boolean NOT NULL,
	"accessibility" boolean NOT NULL,
	"usage_access_off_since" timestamp with time zone,
	"overlay_off_since" timestamp with time zone,
	"notifications_off_since" timestamp with time zone,
	"accessibility_off_since" timestamp with time zone,
	"measured_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_statuses" ADD CONSTRAINT "device_statuses_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;