ALTER TABLE "leads" ALTER COLUMN "linkedin_url" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "leads_org_url_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_org_url_uq" ON "leads" ("org_id","linkedin_url") WHERE "linkedin_url" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_org_email_uq" ON "leads" ("org_id",lower("email")) WHERE "linkedin_url" is null and "email" <> '';
