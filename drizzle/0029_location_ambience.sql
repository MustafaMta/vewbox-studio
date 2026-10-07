-- THE PLACE'S AMBIENCE BED (master plan Phase 5 sound design; src/domain/types.ts LocationAmbience):
--   locations.ambience — the bed the AMBIENCE job made with MOSS-SoundEffect v2 (asset, description, seed, loudness).
--   The World Bible derives each place's ambience from it; the cut loops it under the place's run of scenes. NULL on
--   existing rows = no bed made yet (the cut falls back to the takes' room tone, as before). No table rewrite.
-- Idempotent (IF NOT EXISTS). Rollback: the column is additive; reverting the code stops writing and reading it;
--   ALTER TABLE "locations" DROP COLUMN "ambience".
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "ambience" jsonb;
