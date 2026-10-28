ALTER TABLE "support_conversations" ADD COLUMN "visitor_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "provider_id" text;--> statement-breakpoint
CREATE INDEX "support_conversations_phone_idx" ON "support_conversations" USING btree ("org_id","visitor_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_provider_uq" ON "support_messages" USING btree ("provider_id") WHERE provider_id is not null;