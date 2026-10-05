-- THE PRODUCTION CONTEXT (cloud directive 2026-10-05 §4, §6; src/domain/production-context.ts):
--   scenes.story — what a scene changes in the story as structured records (events, knowledge, persistent changes,
--   relationships; src/domain/types.ts SceneStory). NULL on existing rows = the scene declares no story facts (its
--   purpose / entry / exit text still apply as before). No table rewrite.
--   shots.continuation — a continuous shot's own continuation choice inside the engine's capability (guide length,
--   tail sound; src/domain/video-capability.ts). NULL = the studio's choice, else the engine default (22 frames on
--   local H3 — exactly what every shot used before). No table rewrite.
-- Idempotent (IF NOT EXISTS). Rollback: both columns are additive; reverting the code stops writing and reading them;
--   ALTER TABLE "scenes" DROP COLUMN "story"; ALTER TABLE "shots" DROP COLUMN "continuation".
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "story" jsonb;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "continuation" jsonb;
