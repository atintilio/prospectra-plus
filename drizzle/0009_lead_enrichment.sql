-- Enriquecimento consultivo de leads: sinais públicos (foto, redes profissionais, e-mail corporativo)
-- guardados no próprio lead, mais a fila de jobs no mesmo formato de intelligence_jobs.
ALTER TABLE "leads" ADD COLUMN "email" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enrichment" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "enrichment_jobs" (
	"id" uuid PRIMARY KEY,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrichment_jobs_claim_idx" ON "enrichment_jobs" ("state","created_at");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_scope_idx" ON "enrichment_jobs" ("org_id","user_id","created_at");
