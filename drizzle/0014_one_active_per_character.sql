-- One active job per character for the character jobs (docs/BACKEND-AUDIT-2026-10.md H4, step 3).
-- Before the index: should a database hold two ACTIVE jobs of the same type for one character (the old
-- check-then-insert race), keep the oldest and cancel the others, so the index can be built. A no-op otherwise.
UPDATE "jobs" SET "status" = 'CANCELLED', "cancel_requested" = true, "locked_by" = NULL,
  "finished_at" = now(),
  "updated_at" = now(),
  "error" = '{"code":"CONFLICT","message":"Cancelled by migration 0014: another active job of this type already served this character.","retryable":false}'::jsonb
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "type", "character_id" ORDER BY "created_at", "id") AS "n" FROM "jobs"
    WHERE "status" in ('QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING')
      AND "type" in ('VOICE_BUILD', 'VOICE_DESIGN', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS') AND "character_id" IS NOT NULL
  ) "d" WHERE "d"."n" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_one_active_per_character" ON "jobs" USING btree ("type","character_id") WHERE status in ('QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING') and type in ('VOICE_BUILD', 'VOICE_DESIGN', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS') and character_id is not null;
