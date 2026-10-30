CREATE TABLE "deletion_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_email" text NOT NULL,
	"org_id" uuid NOT NULL,
	"org_name" text NOT NULL,
	"records" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_id" uuid,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helpin_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"subject" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'helpin' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helpin_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "linkedin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT 'Principal' NOT NULL,
	"provider_id" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"session_enc" text,
	"demo" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid,
	"lead_id" uuid,
	"public_id" text NOT NULL,
	"title" text DEFAULT 'Reunião' NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"slot" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"ics_state" text DEFAULT 'none' NOT NULL,
	"ics_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"sender_email" text,
	"atendimento_start" text DEFAULT '09:00' NOT NULL,
	"atendimento_end" text DEFAULT '18:00' NOT NULL,
	"auto_reply" text DEFAULT '' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"seats" integer DEFAULT 5 NOT NULL,
	"search_credits_month" integer DEFAULT 300 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"recipient" text NOT NULL,
	"text" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"engine" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "voice_profiles_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "voice_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "dispatch_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "linkedin_account_id" uuid;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpin_conversations" ADD CONSTRAINT "helpin_conversations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpin_conversations" ADD CONSTRAINT "helpin_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpin_conversations" ADD CONSTRAINT "helpin_conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpin_messages" ADD CONSTRAINT "helpin_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpin_messages" ADD CONSTRAINT "helpin_messages_conversation_id_helpin_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."helpin_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_jobs" ADD CONSTRAINT "intelligence_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_jobs" ADD CONSTRAINT "intelligence_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_jobs" ADD CONSTRAINT "intelligence_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD CONSTRAINT "linkedin_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_accounts" ADD CONSTRAINT "linkedin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_feed" ADD CONSTRAINT "sim_feed_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_feed" ADD CONSTRAINT "sim_feed_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_jobs" ADD CONSTRAINT "voice_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_jobs" ADD CONSTRAINT "voice_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_registrations" ADD CONSTRAINT "voice_registrations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_registrations" ADD CONSTRAINT "voice_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_commands" ADD CONSTRAINT "whatsapp_commands_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_commands" ADD CONSTRAINT "whatsapp_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deletion_reports_pending_idx" ON "deletion_reports" USING btree ("notified_at","claimed_at");--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "helpin_conv_org_status_idx" ON "helpin_conversations" USING btree ("org_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "helpin_msg_conv_idx" ON "helpin_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_jobs_claim_idx" ON "intelligence_jobs" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_jobs_scope_idx" ON "intelligence_jobs" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "linkedin_accounts_user_idx" ON "linkedin_accounts" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_public_id_uq" ON "meetings" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "meetings_org_slot_idx" ON "meetings" USING btree ("org_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_name_uq" ON "plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sim_feed_org_at_idx" ON "sim_feed" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "voice_jobs_scope_idx" ON "voice_jobs" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_jobs_queue_idx" ON "voice_jobs" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "voice_registrations_user_created_idx" ON "voice_registrations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_commands_user_created_idx" ON "whatsapp_commands" USING btree ("user_id","created_at");