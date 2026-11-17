-- Fluxo estilo n8n nas campanhas: grafo salvo por campanha e nó atual por inscrição.
ALTER TABLE "campaigns" ADD COLUMN "graph" jsonb;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "node_id" text;
