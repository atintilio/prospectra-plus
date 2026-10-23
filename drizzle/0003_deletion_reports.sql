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
CREATE INDEX "deletion_reports_pending_idx" ON "deletion_reports" ("notified_at", "claimed_at");

--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "platform_role"='admin' WHERE "email" IN ('atintilio@argusprime.com.br','mloro@argusprime.com.br') AND "status"='active';
