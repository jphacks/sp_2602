ALTER TABLE "excluded_apps" ADD COLUMN "label" varchar(120);
UPDATE "excluded_apps" SET "label" = left("app_id", 120) WHERE "label" IS NULL;
ALTER TABLE "excluded_apps" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "excluded_apps" ADD COLUMN "since_version" integer DEFAULT 1 NOT NULL;
UPDATE "excluded_apps" AS app
SET "since_version" = COALESCE(config."version", 1)
FROM "child_config_versions" AS config
WHERE config."child_id" = app."child_id";
ALTER TABLE "excluded_apps" ALTER COLUMN "since_version" DROP DEFAULT;
ALTER TABLE "excluded_apps" ADD CONSTRAINT "excluded_apps_since_version_positive" CHECK ("since_version" > 0);

ALTER TABLE "plan_settings" ADD COLUMN "config_version" integer;
UPDATE "plan_settings" AS plan
SET "config_version" = COALESCE(config."version", 1)
FROM "child_config_versions" AS config
WHERE config."child_id" = plan."child_id";
UPDATE "plan_settings" SET "config_version" = 1 WHERE "config_version" IS NULL;
ALTER TABLE "plan_settings" ALTER COLUMN "config_version" SET NOT NULL;
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_config_version_positive" CHECK ("config_version" > 0);

CREATE TABLE "blank_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" varchar(120) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blank_periods_name_not_blank" CHECK (length(trim("name")) > 0),
  CONSTRAINT "blank_periods_end_not_before_start" CHECK ("end_date" >= "start_date")
);

CREATE TABLE "removed_excluded_apps" (
  "child_id" uuid NOT NULL REFERENCES "users"("id"),
  "app_id" varchar(255) NOT NULL,
  "label" varchar(120) NOT NULL,
  "removed_version" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "removed_excluded_apps_pk" PRIMARY KEY("child_id", "app_id"),
  CONSTRAINT "removed_excluded_apps_version_positive" CHECK ("removed_version" > 0)
);

CREATE TABLE "excluded_app_states" (
  "child_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),
  "apps_changed_version" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "excluded_app_states_version_nonnegative" CHECK ("apps_changed_version" >= 0)
);

CREATE TABLE "child_applied_versions" (
  "child_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),
  "version" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "child_applied_versions_nonnegative" CHECK ("version" >= 0)
);
