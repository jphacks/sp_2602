CREATE TABLE "child_usual_limits" (
  "child_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),
  "minutes" integer NOT NULL,
  "updated_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "child_usual_limits_minutes_range" CHECK ("minutes" >= 0 AND "minutes" <= 1440)
);--> statement-breakpoint

INSERT INTO "child_usual_limits" ("child_id", "minutes", "updated_by_user_id", "updated_at")
SELECT "child_id", "usual_limit_minutes", "updated_by_user_id", "updated_at"
FROM "plan_settings";
