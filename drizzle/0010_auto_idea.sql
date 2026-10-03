CREATE TABLE "development_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_job_id" text NOT NULL,
	"stage" text NOT NULL,
	"version" integer NOT NULL,
	"agent_id" text NOT NULL,
	"job_id" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"provider" text NOT NULL,
	"query" text NOT NULL,
	"status" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"item_ids" text[] DEFAULT '{}' NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_items" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"language" text,
	"region" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excerpt" text,
	"query" text NOT NULL,
	"creator" text
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_job_id" text,
	"job_id" text,
	"status" text NOT NULL,
	"request" jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_ids" text[] DEFAULT '{}' NOT NULL,
	"reused_from_cache" integer DEFAULT 0 NOT NULL,
	"limitations" text[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "development_artifacts_stage_idx" ON "development_artifacts" USING btree ("idea_job_id","stage","version");--> statement-breakpoint
CREATE INDEX "research_cache_expires_idx" ON "research_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_items_url_idx" ON "research_items" USING btree ("platform","url");--> statement-breakpoint
CREATE INDEX "research_items_retrieved_idx" ON "research_items" USING btree ("retrieved_at");--> statement-breakpoint
CREATE INDEX "research_runs_idea_idx" ON "research_runs" USING btree ("idea_job_id");