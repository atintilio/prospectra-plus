CREATE TABLE lead_communication_profiles (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual', 'observational_quiz')),
  evidence_label text NOT NULL CHECK (evidence_label IN ('declared', 'estimate', 'unavailable')),
  profile_type text CHECK (profile_type IS NULL OR profile_type IN ('D','Di','DI','Dc','I','Id','Is','IS','S','Si','Sc','SC','C','Cs','Cd','CD')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, lead_id),
  CHECK ((source = 'manual' AND evidence_label IN ('declared','unavailable')) OR (source = 'observational_quiz' AND evidence_label IN ('estimate','unavailable'))),
  CHECK ((evidence_label = 'unavailable') = (profile_type IS NULL))
);
--> statement-breakpoint
CREATE INDEX lead_communication_profiles_owner_idx ON lead_communication_profiles (org_id, user_id, assessed_at DESC);
