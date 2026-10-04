-- Aggregate versions (docs/BACKEND-AUDIT-2026-10.md H3, step 11). Idempotent (IF NOT EXISTS).
-- Existing rows: productions, shows, characters and locations gain `version` = 0 (a constant default: Postgres 11+
-- adds it without rewriting the table). Nothing else changes. Rollback: the column is additive; reverting the code
-- stops reading and bumping it.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
