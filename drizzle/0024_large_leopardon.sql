ALTER TABLE "agenda_event_types" ADD COLUMN "reminder_minutes_before" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_event_types" ADD COLUMN "notify_seller" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_event_types" ADD COLUMN "send_invite" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "invite_state" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "invite_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "seller_notified_at" timestamp with time zone;