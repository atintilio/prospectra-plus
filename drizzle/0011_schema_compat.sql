-- Compatibilidade para bases que registraram migrações anteriores sem todas as colunas.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "graph" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "linkedin_account_id" uuid;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "node_id" text;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enrichment" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enriched_at" timestamp with time zone;
