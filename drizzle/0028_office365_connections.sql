CREATE TABLE IF NOT EXISTS "office365_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "microsoft_user_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "email" text NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_lock_until" timestamp with time zone,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "office365_connections_org_user_uq" ON "office365_connections" USING btree ("org_id", "user_id");
