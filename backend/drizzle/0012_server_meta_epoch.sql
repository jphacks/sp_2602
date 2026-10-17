CREATE TABLE "server_meta" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"epoch" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_meta_single_row" CHECK ("server_meta"."id" = 1)
);
