CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"department_id" text NOT NULL,
	"job_id" text NOT NULL,
	"job_type" text NOT NULL,
	"attempt" integer NOT NULL,
	"production_id" text,
	"shot_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"failure_class" text,
	"error_message" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ms" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department_id" text NOT NULL,
	"role" text NOT NULL,
	"description" text NOT NULL,
	"system_instructions" text NOT NULL,
	"model" text NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"tools" text[] DEFAULT '{}' NOT NULL,
	"input_schema" text NOT NULL,
	"output_schema" text NOT NULL,
	"limits" jsonb NOT NULL,
	"version" text NOT NULL,
	"quality_requirements" text[] DEFAULT '{}' NOT NULL,
	"job_types" text[] DEFAULT '{}' NOT NULL,
	"org_version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"stage" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"decision" text NOT NULL,
	"by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"director_id" text NOT NULL,
	"responsibility" text NOT NULL,
	"stages" text[] DEFAULT '{}' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"org_version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"stage" text NOT NULL,
	"producer_department" text NOT NULL,
	"receiver_department" text,
	"artifact_ids" text[] DEFAULT '{}' NOT NULL,
	"input_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"quality_status" text NOT NULL,
	"remaining_dependencies" text[] DEFAULT '{}' NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"inspector_id" text NOT NULL,
	"checks" jsonb NOT NULL,
	"failure_class" text,
	"decision" text NOT NULL,
	"evidence_asset_ids" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"job_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reliability_events" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_type" text NOT NULL,
	"production_id" text,
	"shot_id" text,
	"attempt" integer NOT NULL,
	"failure_class" text NOT NULL,
	"failure_message" text,
	"change_made" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"source" text NOT NULL,
	"source_version" text NOT NULL,
	"supported_models" text[] DEFAULT '{}' NOT NULL,
	"required_tools" text[] DEFAULT '{}' NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"instructions" text,
	"org_version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"department_id" text NOT NULL,
	"agent_id" text,
	"production_id" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"job_id" text
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"version" text NOT NULL,
	"input_schema" text NOT NULL,
	"output_schema" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"timeout_ms" integer NOT NULL,
	"resource" text NOT NULL,
	"vram_mb" integer,
	"errors" text[] DEFAULT '{}' NOT NULL,
	"org_version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_production_idx" ON "agent_runs" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "agent_runs_job_idx" ON "agent_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "agents_department_idx" ON "agents" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "approvals_production_idx" ON "approvals" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE INDEX "handoffs_production_idx" ON "handoffs" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE INDEX "qa_reports_production_idx" ON "qa_reports" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE INDEX "qa_reports_subject_idx" ON "qa_reports" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "reliability_events_job_idx" ON "reliability_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "reliability_events_at_idx" ON "reliability_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "studio_events_at_idx" ON "studio_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "studio_events_production_idx" ON "studio_events" USING btree ("production_id","at");