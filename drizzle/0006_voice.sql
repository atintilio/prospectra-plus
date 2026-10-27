CREATE TABLE voice_profiles (
 org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 external_id text NOT NULL,
 engine text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 consent_at timestamptz NOT NULL,
 PRIMARY KEY(org_id,user_id)
);
--> statement-breakpoint
CREATE TABLE voice_jobs (
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 profile_id text NOT NULL,
 recipient text NOT NULL,
 text text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('audio','call')),
 state text NOT NULL CHECK(state IN ('queued','running','sent','unknown','failed','waiting_transport')),
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz
);
--> statement-breakpoint
CREATE INDEX voice_jobs_scope_idx ON voice_jobs(org_id,user_id,created_at);
--> statement-breakpoint
CREATE INDEX voice_jobs_queue_idx ON voice_jobs(state,created_at);
--> statement-breakpoint
CREATE TABLE voice_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX voice_registrations_user_created_idx ON voice_registrations(user_id,created_at);
