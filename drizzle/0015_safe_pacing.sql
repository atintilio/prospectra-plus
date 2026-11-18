ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "min_action_gap_min" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "weekly_invite_cap" integer DEFAULT 100 NOT NULL;
