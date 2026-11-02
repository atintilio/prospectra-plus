CREATE TABLE IF NOT EXISTS "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"assigned_to" uuid,
	"ai_brief" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "flows_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "flows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"condition" text DEFAULT 'always' NOT NULL,
	"template" text DEFAULT '' NOT NULL,
	"use_ai" boolean DEFAULT false NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"media_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_steps_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "flow_steps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flows_org_updated_idx" ON "flows" USING btree ("org_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_steps_flow_position_idx" ON "flow_steps" USING btree ("flow_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_steps_org_idx" ON "flow_steps" USING btree ("org_id");
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "flow_id" uuid;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE set null ON UPDATE no action;
