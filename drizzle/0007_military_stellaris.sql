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
--> statement-breakpoint;
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "dispatch_state" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "provider_id" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "linkedin_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_id" uuid;
--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX "helpin_conv_org_status_idx" ON "helpin_conversations" USING btree ("org_id","status","last_message_at");
--> statement-breakpoint
CREATE INDEX "helpin_msg_conv_idx" ON "helpin_messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "linkedin_accounts_user_idx" ON "linkedin_accounts" USING btree ("org_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_public_id_uq" ON "meetings" USING btree ("public_id");
--> statement-breakpoint
CREATE INDEX "meetings_org_slot_idx" ON "meetings" USING btree ("org_id","slot");
--> statement-breakpoint
CREATE UNIQUE INDEX "plans_name_uq" ON "plans" USING btree ("name");