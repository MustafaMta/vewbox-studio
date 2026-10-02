ALTER TABLE "studio_meta" ADD COLUMN "intake_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_meta" ADD COLUMN "intake_paused_reason" text;