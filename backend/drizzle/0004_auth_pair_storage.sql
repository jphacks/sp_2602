ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_subject_unique" UNIQUE("provider", "subject")
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE TABLE "pair_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"child_id" uuid NOT NULL,
	"child_display_name" varchar(120) NOT NULL,
	"parent_id" uuid,
	"state" varchar(16) DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "pair_tickets_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "pair_tickets_state_check" CHECK ("state" in ('waiting', 'claimed', 'linked', 'expired', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "pair_tickets" ADD CONSTRAINT "pair_tickets_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pair_tickets" ADD CONSTRAINT "pair_tickets_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "pair_tickets_child_created_idx" ON "pair_tickets" USING btree ("child_id", "created_at");
--> statement-breakpoint
CREATE INDEX "pair_tickets_parent_created_idx" ON "pair_tickets" USING btree ("parent_id", "created_at");
