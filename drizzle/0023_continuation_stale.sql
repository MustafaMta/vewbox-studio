-- The stale continuation chain (docs/research/STORYBUILDER-INTEGRATION.md §f.5, gap V3). Idempotent (IF NOT EXISTS).
-- Existing rows: every take gets stale = NULL (no table rewrite). A continuation take made before this migration is
-- marked only when its production next changes (src/domain/actions.ts runs reconcileContinuationChain on every
-- production change), never retroactively by the migration itself. Rollback: the column is additive; reverting the
-- code stops setting and reading it; ALTER TABLE "takes" DROP COLUMN "stale".
ALTER TABLE "takes" ADD COLUMN IF NOT EXISTS "stale" jsonb;
