CREATE TABLE "agenda_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_blackouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"slot_interval_min" integer DEFAULT 30 NOT NULL,
	"min_notice_min" integer DEFAULT 120 NOT NULL,
	"buffer_min" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"lead_id" uuid,
	"token" text NOT NULL,
	"channel" text DEFAULT 'link' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "event_type_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "link_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "attendee_name" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "attendee_email" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "attendee_phone" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "end_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cancel_token" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agenda_availability" ADD CONSTRAINT "agenda_availability_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_availability" ADD CONSTRAINT "agenda_availability_event_type_id_agenda_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."agenda_event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_blackouts" ADD CONSTRAINT "agenda_blackouts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_event_types" ADD CONSTRAINT "agenda_event_types_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_event_types" ADD CONSTRAINT "agenda_event_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_links" ADD CONSTRAINT "agenda_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_links" ADD CONSTRAINT "agenda_links_event_type_id_agenda_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."agenda_event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_links" ADD CONSTRAINT "agenda_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_availability_event_idx" ON "agenda_availability" USING btree ("event_type_id","day_of_week");--> statement-breakpoint
CREATE INDEX "agenda_blackouts_org_idx" ON "agenda_blackouts" USING btree ("org_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_event_types_slug_uq" ON "agenda_event_types" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "agenda_event_types_org_idx" ON "agenda_event_types" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_links_token_uq" ON "agenda_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "agenda_links_event_idx" ON "agenda_links" USING btree ("event_type_id");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_event_type_id_agenda_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."agenda_event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_link_id_agenda_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."agenda_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_org_start_idx" ON "meetings" USING btree ("org_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "meetings_event_type_idx" ON "meetings" USING btree ("event_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_no_double_booking" ON "meetings" USING btree ("org_id","user_id","scheduled_at") WHERE status in ('requested','confirmed');