-- Stale derivatives (docs/BACKEND-AUDIT-2026-10.md M2, step 12). Idempotent (IF NOT EXISTS).
-- Existing rows: every production gets cut_stale = false (a constant default, no table rewrite): an existing cut is
-- taken as current until the next change to what it was made from. Rollback: the column is additive; reverting the
-- code stops setting and reading it.
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "cut_stale" boolean DEFAULT false NOT NULL;
