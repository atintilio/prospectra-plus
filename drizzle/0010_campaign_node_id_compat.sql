-- Compatibilidade para bases que marcaram 0008 como aplicada antes da coluna do fluxo.
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "node_id" text;
