CREATE TABLE "support_team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "support_team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "support_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_conversations" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_team_id_support_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_teams" ADD CONSTRAINT "support_teams_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_team_members_user_idx" ON "support_team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_teams_org_name_uq" ON "support_teams" USING btree ("org_id","name");--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_team_id_support_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_teams"("id") ON DELETE set null ON UPDATE no action;