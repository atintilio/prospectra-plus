ALTER TABLE "support_messages" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "mentions" text[] DEFAULT '{}'::text[] NOT NULL;