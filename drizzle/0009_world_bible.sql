CREATE TABLE "audio_timelines" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"revision" integer NOT NULL,
	"hash" text NOT NULL,
	"timeline" jsonb NOT NULL,
	"cut_asset_id" text,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_pins" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"scope_key" text NOT NULL,
	"reason" text NOT NULL,
	"approval_id" text,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by" text NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_reads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"pinned" boolean NOT NULL,
	"job_id" text,
	"job_type" text NOT NULL,
	"shot_id" text,
	"take_id" text,
	"read" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_key" text NOT NULL,
	"show_id" text,
	"production_id" text,
	"number" integer NOT NULL,
	"parent_id" text,
	"author_kind" text NOT NULL,
	"author_id" text NOT NULL,
	"reason" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hash" text NOT NULL,
	"bible" jsonb NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_pins" ADD CONSTRAINT "world_pins_revision_id_world_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."world_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_timelines_production_revision_idx" ON "audio_timelines" USING btree ("production_id","revision");--> statement-breakpoint
CREATE INDEX "world_pins_production_idx" ON "world_pins" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE INDEX "world_reads_production_idx" ON "world_reads" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE INDEX "world_reads_take_idx" ON "world_reads" USING btree ("take_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_revisions_scope_number_idx" ON "world_revisions" USING btree ("scope_key","number");--> statement-breakpoint
CREATE INDEX "world_revisions_show_idx" ON "world_revisions" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "world_revisions_production_idx" ON "world_revisions" USING btree ("production_id");