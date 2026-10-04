-- The command journal and bound approvals (docs/BACKEND-AUDIT-2026-10.md H9, H10, step 9). Idempotent.
-- Existing rows: approvals gain two NULL columns (an approval recorded before this step has no subject hash and is
-- accepted by the gates as it was); command_log starts empty. Nothing is rewritten or deleted.
-- Rollback: APPROVAL_BINDING=off disables the gate comparison; the table and the columns are additive.
CREATE TABLE IF NOT EXISTS "command_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"origin" text NOT NULL,
	"job_id" text,
	"commands" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"studio_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "subject_hash" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "subject_version" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "command_log_batch_idx" ON "command_log" USING btree ("client_id","batch_id") WHERE ok;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "command_log_created_idx" ON "command_log" USING btree ("created_at");
