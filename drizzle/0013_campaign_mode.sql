-- Coexistência assistido x automático por campanha.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'assistido' NOT NULL;
