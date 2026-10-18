ALTER TABLE "usage_sync_batches" DROP CONSTRAINT "usage_sync_batches_payload_hash_not_blank";--> statement-breakpoint
ALTER TABLE "usage_sync_batches" ALTER COLUMN "payload_hash" DROP NOT NULL;