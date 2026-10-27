CREATE TABLE commercial_profiles (org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,seller_name text NOT NULL,company_name text NOT NULL,seller_phone text NOT NULL,strategy text NOT NULL,offers jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,user_id));
--> statement-breakpoint
CREATE TABLE harvey_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,phone text NOT NULL,qualification text NOT NULL,profile jsonb NOT NULL,state text NOT NULL DEFAULT 'active',turns integer NOT NULL DEFAULT 0,summary text NOT NULL DEFAULT '',recipients jsonb NOT NULL DEFAULT '[]'::jsonb,approved_at timestamptz NOT NULL DEFAULT now(),next_reminder_at timestamptz);
--> statement-breakpoint
CREATE UNIQUE INDEX harvey_conversation_lead_uq ON harvey_conversations(org_id,lead_id);
--> statement-breakpoint
CREATE UNIQUE INDEX harvey_conversation_phone_uq ON harvey_conversations(org_id,user_id,phone);
--> statement-breakpoint
CREATE TABLE harvey_inbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES harvey_conversations(id) ON DELETE CASCADE,provider_id text NOT NULL,text text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX harvey_inbox_receipt_uq ON harvey_inbox(conversation_id,provider_id);
--> statement-breakpoint
CREATE TABLE harvey_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES harvey_conversations(id) ON DELETE CASCADE,kind text NOT NULL,recipient text NOT NULL,body text NOT NULL,state text NOT NULL DEFAULT 'pending',error text,due_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX harvey_outbox_due_idx ON harvey_outbox(state,due_at);
--> statement-breakpoint
ALTER TABLE harvey_outbox ADD COLUMN claimed_at timestamptz;
--> statement-breakpoint
CREATE TABLE harvey_seller_inbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id uuid REFERENCES harvey_conversations(id) ON DELETE SET NULL,provider_id text NOT NULL,text text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX harvey_seller_inbox_receipt_uq ON harvey_seller_inbox(org_id,user_id,provider_id);
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN qualification text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE harvey_inbound_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider_id text NOT NULL,phone text NOT NULL,text text NOT NULL,state text NOT NULL DEFAULT 'queued',error text,claimed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX harvey_inbound_receipt_uq ON harvey_inbound_jobs(org_id,user_id,provider_id);
--> statement-breakpoint
CREATE INDEX harvey_inbound_queue_idx ON harvey_inbound_jobs(state,created_at);
