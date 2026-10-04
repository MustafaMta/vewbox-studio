-- The shared GPU lease (docs/BACKEND-AUDIT-2026-10.md H7, step 8): two NEW tables, nothing existing is touched.
-- Idempotent (IF NOT EXISTS). Existing rows: none affected. Rollback: GPU_LEASE=memory (the in-process lease), then
-- DROP TABLE "resource_leases", "resource_state".
CREATE TABLE IF NOT EXISTS "resource_leases" (
	"resource" text NOT NULL,
	"holder" text NOT NULL,
	"ticket" bigserial NOT NULL,
	"family" text NOT NULL,
	"state" text NOT NULL,
	"job_id" text,
	"process" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"granted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resource_leases_resource_holder_pk" PRIMARY KEY("resource","holder")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_state" (
	"resource" text PRIMARY KEY NOT NULL,
	"loaded_family" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_leases_queue_idx" ON "resource_leases" USING btree ("resource","ticket");
