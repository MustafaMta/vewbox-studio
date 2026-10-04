-- Orchestration as data (docs/BACKEND-AUDIT-2026-10.md M1, step 14). Idempotent (IF NOT EXISTS / guarded constraints).
-- Existing rows: every job gains wakes = 0 (a constant default, no table rewrite) and plan = NULL; job_dependencies
-- starts empty. No job changes status: a PRODUCE running under the old polling code finishes as it was; the new
-- planner only starts with the next PRODUCE pass. Rollback: the table and columns are additive (PRODUCE_DAG=off runs
-- the polling orchestrator); DROP TABLE "job_dependencies"; ALTER TABLE "jobs" DROP COLUMN "wakes", DROP COLUMN "plan".
CREATE TABLE IF NOT EXISTS "job_dependencies" (
	"job_id" text NOT NULL,
	"depends_on" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "job_dependencies_job_id_depends_on_pk" PRIMARY KEY("job_id","depends_on")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "wakes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "plan" jsonb;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_dependencies_job_id_jobs_id_fk') THEN
    ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_dependencies_depends_on_jobs_id_fk') THEN
    ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_depends_on_jobs_id_fk" FOREIGN KEY ("depends_on") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_dependencies_depends_on_idx" ON "job_dependencies" USING btree ("depends_on");
