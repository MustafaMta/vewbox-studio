-- One audit log (docs/BACKEND-AUDIT-2026-10.md M4, step 15). Idempotent (IF NOT EXISTS / guarded constraint /
-- ON CONFLICT DO NOTHING).
-- Existing rows:
--   * job_attempts is created and BACKFILLED from reliability_events: one FAILED attempt row per reliability event whose
--     job still exists (job, attempt, type, production, shot, class, message, change made, resolved; started/finished
--     at the event's time). Events of jobs that no longer exist are not copied (the job row is gone; the event stays in
--     reliability_events). reliability_events itself is NOT changed and no longer written (read-only for one release).
--   * studio_events gains a NULL run_id column (constant default, no rewrite) and an index on it; existing events are
--     untouched. agent_runs.tool_calls is not rewritten: the old JSONB arrays stay and are read beside the new rows.
-- Rollback: revert the code (it reads reliability_events again); DROP TABLE "job_attempts";
-- ALTER TABLE "studio_events" DROP COLUMN "run_id".
CREATE TABLE IF NOT EXISTS "job_attempts" (
	"job_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"job_type" text NOT NULL,
	"production_id" text,
	"shot_id" text,
	"worker_id" text,
	"run_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"failure_class" text,
	"failure_message" text,
	"change_made" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"ms" integer,
	CONSTRAINT "job_attempts_job_id_attempt_pk" PRIMARY KEY("job_id","attempt")
);
--> statement-breakpoint
ALTER TABLE "studio_events" ADD COLUMN IF NOT EXISTS "run_id" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_attempts_job_id_jobs_id_fk') THEN
    ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_attempts_failure_idx" ON "job_attempts" USING btree ("failure_class","finished_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_events_run_idx" ON "studio_events" USING btree ("run_id");--> statement-breakpoint
INSERT INTO "job_attempts" ("job_id", "attempt", "job_type", "production_id", "shot_id", "started_at", "finished_at", "outcome", "failure_class", "failure_message", "change_made", "resolved")
SELECT DISTINCT ON (r."job_id", r."attempt") r."job_id", r."attempt", r."job_type", r."production_id", r."shot_id", r."created_at", r."created_at", 'FAILED', r."failure_class", r."failure_message", r."change_made", r."resolved"
FROM "reliability_events" r
WHERE EXISTS (SELECT 1 FROM "jobs" j WHERE j."id" = r."job_id")
ORDER BY r."job_id", r."attempt", r."created_at" DESC
ON CONFLICT ("job_id", "attempt") DO NOTHING;
