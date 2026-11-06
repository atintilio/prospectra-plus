DROP INDEX IF EXISTS "leads_org_url_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "leads_org_url_uq" ON "leads" ("org_id", "linkedin_url") WHERE "linkedin_url" <> '';
