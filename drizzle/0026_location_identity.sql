-- THE LOCATION BIBLE (src/domain/location.ts, src/domain/types.ts LocationIdentity / Scene.establishLocation):
--   locations.identity — the place's canonical identity (version, hash, identity line, updatedAt), written by the
--   reducers on every change of the place; NULL on existing rows = version 1 of what the row holds (derived on read,
--   stored at the next change). No table rewrite.
--   scenes.establish_location — "establish here": the scene is its place's first appearance and may be filmed without
--   a plate (the first accepted take's opening frame becomes the plate). NULL on existing rows = not marked: a shot
--   in a place without a plate is refused as before (now as UnestablishedLocationError).
-- Rollback: both columns are additive; reverting the code stops writing and reading them;
--   ALTER TABLE "locations" DROP COLUMN "identity"; ALTER TABLE "scenes" DROP COLUMN "establish_location".
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "identity" jsonb;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "establish_location" boolean;
