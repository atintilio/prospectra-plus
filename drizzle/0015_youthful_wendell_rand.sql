ALTER TABLE "leads" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_org_email_idx" ON "leads" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "leads_org_phone_idx" ON "leads" USING btree ("org_id","phone");