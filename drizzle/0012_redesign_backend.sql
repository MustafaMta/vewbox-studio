CREATE TABLE "cut_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"cut_asset_id" text,
	"cut_version" integer,
	"timecode" double precision NOT NULL,
	"range_end" double precision,
	"pin_x" double precision,
	"pin_y" double precision,
	"drawing_asset_id" text,
	"text" text NOT NULL,
	"author" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sent_to_shot_id" text,
	"produced_take_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "phases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "thumb" jsonb;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN "frame_poster_asset_id" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "rating" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "rating_reason" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "rated_by" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "cut_notes_production_idx" ON "cut_notes" USING btree ("production_id","timecode");--> statement-breakpoint
CREATE INDEX "cut_notes_cut_idx" ON "cut_notes" USING btree ("cut_asset_id");