CREATE TABLE "whatsapp_commands" (
 "id" uuid PRIMARY KEY NOT NULL,
 "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "payload_hash" text NOT NULL,
 "state" text NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending','sent','unknown')),
 "provider_message_id" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_commands_user_created_idx" ON "whatsapp_commands" ("user_id","created_at");
