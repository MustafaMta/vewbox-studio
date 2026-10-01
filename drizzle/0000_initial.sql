CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"storage" text NOT NULL,
	"path" text NOT NULL,
	"poster_asset_id" text,
	"poster_path" text,
	"label" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"fps" double precision,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"origin" text NOT NULL,
	"mime_type" text,
	"bytes" integer,
	"sha256" text,
	"provenance" jsonb,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"production_id" text NOT NULL,
	"production_title" text NOT NULL,
	"shot_id" text NOT NULL,
	"shot_label" text NOT NULL,
	"take_id" text NOT NULL,
	"take_label" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'IN_TAKE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"role" text DEFAULT '' NOT NULL,
	"style" text NOT NULL,
	"sex" text NOT NULL,
	"species" text,
	"age_years" integer DEFAULT 30 NOT NULL,
	"build" text DEFAULT '' NOT NULL,
	"face" text DEFAULT '' NOT NULL,
	"hair" text DEFAULT '' NOT NULL,
	"skin" text DEFAULT '' NOT NULL,
	"eyes" text DEFAULT '' NOT NULL,
	"distinguishing" text[] DEFAULT '{}' NOT NULL,
	"wardrobe" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"language" text NOT NULL,
	"dialect" text,
	"voice" jsonb NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"portrait_asset_id" text,
	"usage_known" boolean DEFAULT true NOT NULL,
	"pending_reference" jsonb,
	"canon" jsonb,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"shot_id" text NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"progress" jsonb,
	"error" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"provider_task_id" text,
	"parent_id" text,
	"production_id" text,
	"scene_id" text,
	"shot_id" text,
	"take_id" text,
	"character_id" text,
	"location_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"style" text NOT NULL,
	"lighting" text[] DEFAULT '{}' NOT NULL,
	"landmarks" text[] DEFAULT '{}' NOT NULL,
	"props" text[] DEFAULT '{}' NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"master_asset_id" text,
	"layout" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"job_id" text,
	"name" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"labels" jsonb
);
--> statement-breakpoint
CREATE TABLE "models" (
	"name" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"kind" text NOT NULL,
	"local" boolean NOT NULL,
	"path" text,
	"sha256" text,
	"bytes" double precision,
	"vram_mb" integer,
	"status" text DEFAULT 'UNKNOWN' NOT NULL,
	"metadata" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"show_id" text,
	"season_id" text,
	"episode_number" integer,
	"title" text NOT NULL,
	"title_ar" text,
	"logline" text DEFAULT '' NOT NULL,
	"synopsis" text DEFAULT '' NOT NULL,
	"style" text NOT NULL,
	"language" text NOT NULL,
	"dialect" text,
	"aspect" text NOT NULL,
	"target_seconds" integer NOT NULL,
	"stage" text NOT NULL,
	"brief" jsonb NOT NULL,
	"cast_ids" text[] DEFAULT '{}' NOT NULL,
	"location_ids" text[] DEFAULT '{}' NOT NULL,
	"song" jsonb,
	"cover_asset_id" text,
	"poster_asset_id" text,
	"artist" text,
	"concept" text,
	"genre" text,
	"mood" text,
	"cut_asset_id" text,
	"exports" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"request" jsonb NOT NULL,
	"proposal" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"position" integer NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"location_id" text,
	"time_of_day" text NOT NULL,
	"character_ids" text[] DEFAULT '{}' NOT NULL,
	"beats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"purpose" text,
	"emotional_objective" text,
	"entry_state" text,
	"exit_state" text
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"arc" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"position" integer NOT NULL,
	"number" integer NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"framing" text NOT NULL,
	"camera_move" text NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"character_ids" text[] DEFAULT '{}' NOT NULL,
	"dialogue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transition" text NOT NULL,
	"opening_frame_asset_id" text,
	"ending_frame_asset_id" text,
	"selected_take_id" text,
	"song_window" jsonb,
	"performance" jsonb,
	"notes" text,
	"continuity" jsonb,
	"prompt" text
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_ar" text,
	"logline" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT '' NOT NULL,
	"style" text NOT NULL,
	"language" text NOT NULL,
	"dialect" text,
	"aspect" text NOT NULL,
	"synopsis" text,
	"cover_asset_id" text,
	"poster_asset_id" text,
	"cast_ids" text[] DEFAULT '{}' NOT NULL,
	"location_ids" text[] DEFAULT '{}' NOT NULL,
	"bible" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"seeded_at" timestamp with time zone,
	"seed_kind" text,
	"seed_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" text PRIMARY KEY NOT NULL,
	"shot_id" text NOT NULL,
	"production_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"note" text,
	"status" text DEFAULT 'READY' NOT NULL,
	"provider" text,
	"model" text,
	"request_id" text,
	"prompt" text,
	"params" jsonb,
	"seed" integer,
	"references" jsonb,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"fps" double precision,
	"generation_ms" integer,
	"cost_usd" double precision,
	"qa" jsonb,
	"rejection_reason" text,
	"job_id" text,
	"code_version" text,
	"workflow_version" text,
	"thumbnail_asset_id" text
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"name" text NOT NULL,
	"version" text NOT NULL,
	"graph" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workflows_name_version_pk" PRIMARY KEY("name","version")
);
--> statement-breakpoint
ALTER TABLE "character_usage" ADD CONSTRAINT "character_usage_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_versions" ADD CONSTRAINT "continuity_versions_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_usage_unique" ON "character_usage" USING btree ("character_id","shot_id","take_id");--> statement-breakpoint
CREATE INDEX "character_usage_character_idx" ON "character_usage" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "continuity_shot_idx" ON "continuity_versions" USING btree ("shot_id","version");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_idx" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "jobs_production_idx" ON "jobs" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "jobs_parent_idx" ON "jobs" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "metrics_name_idx" ON "metrics" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "productions_show_idx" ON "productions" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "productions_season_idx" ON "productions" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "scenes_production_idx" ON "scenes" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "seasons_show_idx" ON "seasons" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "shots_production_idx" ON "shots" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "shots_scene_idx" ON "shots" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "takes_shot_idx" ON "takes" USING btree ("shot_id");--> statement-breakpoint
CREATE INDEX "takes_production_idx" ON "takes" USING btree ("production_id");