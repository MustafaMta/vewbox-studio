-- The shot boundary (docs/research/STORYBUILDER-INTEGRATION.md §f.6): continuous | cut | transition, the planner's
-- explicit decision on how a shot joins the one before it. Idempotent (IF NOT EXISTS).
-- Existing rows: every shot gets boundary = NULL (no table rewrite); a shot without it reads its older plan's
-- continuity.relationToPrevious (src/server/production/shot-pack.ts boundaryOf), so nothing already planned changes.
-- Rollback: the column is additive; reverting the code stops writing and reading it; ALTER TABLE "shots" DROP COLUMN
-- "boundary".
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "boundary" text;
