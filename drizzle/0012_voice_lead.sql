-- Vincula o job de voz ao lead (integração Voice Studio ↔ carteira). Coluna opcional.
ALTER TABLE "voice_jobs" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_jobs" ADD CONSTRAINT "voice_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
