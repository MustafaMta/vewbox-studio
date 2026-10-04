-- The staging inside a shot (docs/research/STORYBUILDER-INTEGRATION.md §d, §f.6-f.7): timed beats, in-take cuts,
-- pace, point of view, extras, the actions covered (src/domain/types.ts ShotStaging). Idempotent (IF NOT EXISTS).
-- Existing rows: every shot gets staging = NULL (no table rewrite); a shot without it is prompted as before (one
-- [Shot 1], its action). Rollback: the column is additive; reverting the code stops writing and reading it;
-- ALTER TABLE "shots" DROP COLUMN "staging".
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "staging" jsonb;
