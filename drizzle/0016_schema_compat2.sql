-- Compatibilidade (2): bases que registraram migrações antigas sem todas as colunas.
-- Tudo IF NOT EXISTS / idempotente: seguro de rodar em qualquer estado.

-- orgs (0001/0003/0007)
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "seats" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "search_credits_month" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "driver" text DEFAULT 'assisted' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- plans (0007)
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"seats" integer DEFAULT 5 NOT NULL,
	"search_credits_month" integer DEFAULT 300 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_name_uq" ON "plans" ("name");--> statement-breakpoint

-- actions (0007)
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "dispatch_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "provider_id" text;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "executed_at" timestamp with time zone;--> statement-breakpoint

-- campaigns (0007/0008/0013)
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "linkedin_account_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "graph" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ai_brief" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'assistido' NOT NULL;--> statement-breakpoint

-- enrollments (0011)
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "node_id" text;--> statement-breakpoint

-- leads (0009/0014)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enrichment" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "enriched_at" timestamp with time zone;--> statement-breakpoint

-- org_settings (0015)
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "min_action_gap_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "weekly_invite_cap" integer DEFAULT 100 NOT NULL;
