ALTER TABLE lead_communication_profiles DROP CONSTRAINT IF EXISTS lead_communication_profiles_source_check;--> statement-breakpoint
ALTER TABLE lead_communication_profiles ADD CONSTRAINT lead_communication_profiles_source_check CHECK (source IN ('manual', 'observational_quiz', 'inferred'));--> statement-breakpoint
ALTER TABLE lead_communication_profiles DROP CONSTRAINT IF EXISTS lead_communication_profiles_check;--> statement-breakpoint
ALTER TABLE lead_communication_profiles ADD CONSTRAINT lead_communication_profiles_check CHECK ((source = 'manual' AND evidence_label IN ('declared','unavailable')) OR (source = 'observational_quiz' AND evidence_label IN ('estimate','unavailable')) OR (source = 'inferred' AND evidence_label IN ('estimate','unavailable')));
