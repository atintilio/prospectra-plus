CREATE TABLE IF NOT EXISTS "linkedin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"profile_name" text DEFAULT '' NOT NULL,
	"profile_email" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"connected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "linkedin_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_connections_org_user_uq" ON "linkedin_connections" USING btree ("org_id","user_id");
