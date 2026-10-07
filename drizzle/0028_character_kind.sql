-- THE PERFORMER KIND (master plan §3, Phase 1; src/domain/types.ts Character.kind / SingingProfile):
--   characters.kind — ACTOR | SINGER | ACTOR_SINGER; existing rows are actors (the default). No table rewrite.
--   characters.singing — a singer's capability (voice type, styles, languages), kept apart from the spoken `voice`;
--   NULL for an actor.
-- Idempotent (IF NOT EXISTS). Rollback: both columns are additive; reverting the code stops writing and reading them;
--   ALTER TABLE "characters" DROP COLUMN "kind"; ALTER TABLE "characters" DROP COLUMN "singing".
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'ACTOR' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "singing" jsonb;
