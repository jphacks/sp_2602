CREATE TABLE "blocked_site_states" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"sites_changed_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_site_states_version_nonnegative" CHECK ("blocked_site_states"."sites_changed_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blocked_sites" (
	"child_id" uuid NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"since_version" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_sites_pk" PRIMARY KEY("child_id","pattern"),
	CONSTRAINT "blocked_sites_pattern_not_blank" CHECK (length(trim("blocked_sites"."pattern")) > 0),
	CONSTRAINT "blocked_sites_since_version_positive" CHECK ("blocked_sites"."since_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "blocked_site_states" ADD CONSTRAINT "blocked_site_states_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_sites" ADD CONSTRAINT "blocked_sites_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_sites" ADD CONSTRAINT "blocked_sites_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;