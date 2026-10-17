CREATE TABLE "child_app_icons" (
	"child_id" uuid NOT NULL,
	"app_id" varchar(255) NOT NULL,
	"icon_hash" varchar(64) NOT NULL,
	"png" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "child_app_icons_pk" PRIMARY KEY("child_id","app_id")
);
--> statement-breakpoint
CREATE TABLE "child_app_list_items" (
	"child_id" uuid NOT NULL,
	"app_id" varchar(255) NOT NULL,
	"label" varchar(120) NOT NULL,
	CONSTRAINT "child_app_list_items_pk" PRIMARY KEY("child_id","app_id"),
	CONSTRAINT "child_app_list_items_app_id_not_blank" CHECK (length(trim("child_app_list_items"."app_id")) > 0),
	CONSTRAINT "child_app_list_items_label_not_blank" CHECK (length(trim("child_app_list_items"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "child_app_lists" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_app_icons" ADD CONSTRAINT "child_app_icons_child_id_child_app_lists_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_app_lists"("child_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_app_list_items" ADD CONSTRAINT "child_app_list_items_child_id_child_app_lists_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_app_lists"("child_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_app_lists" ADD CONSTRAINT "child_app_lists_child_id_users_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;