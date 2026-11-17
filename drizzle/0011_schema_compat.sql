-- Compatibilidade para bases que registraram migrações anteriores sem todas as colunas.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "graph" jsonb;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "linkedin_account_id" uuid;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "node_id" text;
ALTER TABLE "enrichment_jobs" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enrichment" jsonb;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enriched_at" timestamp with time zone;
