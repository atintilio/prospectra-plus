CREATE TABLE intelligence_jobs (
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','completed','failed','cancelled')),
 result jsonb,
 error text,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 3),
 claimed_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX intelligence_jobs_claim_idx ON intelligence_jobs(state,created_at);
--> statement-breakpoint
CREATE INDEX intelligence_jobs_scope_idx ON intelligence_jobs(org_id,user_id,created_at);
