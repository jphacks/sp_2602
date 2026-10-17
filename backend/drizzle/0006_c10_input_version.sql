ALTER TABLE "child_config_versions"
  ADD COLUMN "c10_input_version" integer DEFAULT 1 NOT NULL;
UPDATE "child_config_versions" SET "c10_input_version" = "version";
ALTER TABLE "child_config_versions"
  ADD CONSTRAINT "child_config_versions_c10_input_positive" CHECK ("c10_input_version" > 0);

ALTER TABLE "plan_calculation_versions"
  RENAME COLUMN "source_config_version" TO "source_c10_input_version";
ALTER TABLE "plan_calculation_versions"
  DROP CONSTRAINT "plan_calculation_source_version_positive";
ALTER TABLE "plan_calculation_versions"
  ADD CONSTRAINT "plan_calculation_source_c10_input_version_positive"
  CHECK ("source_c10_input_version" > 0);
