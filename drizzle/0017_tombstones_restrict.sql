-- No more cascading take loss (docs/BACKEND-AUDIT-2026-10.md C4, step 10). Idempotent: every column is added IF NOT
-- EXISTS, and every foreign key is dropped IF EXISTS and added again (in the same transaction: there is no moment
-- without it).
-- Existing rows: shows, seasons, productions, scenes, shots and takes gain deleted_at / deleted_by, NULL on every
-- existing row (every row stays live; nothing is deleted or rewritten). The seven foreign keys between them change
-- from ON DELETE CASCADE to ON DELETE RESTRICT; the existing rows already satisfy them, so re-adding them only
-- validates (a short SHARE ROW EXCLUSIVE lock on these tables — apply with the studio idle, after the backup).
-- Rollback: revert the code first (it stops writing tombstones), then put CASCADE back with the same statements;
-- tombstoned rows can then be purged deliberately (DELETE … WHERE deleted_at IS NOT NULL, takes first).
ALTER TABLE "shows" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN IF NOT EXISTS "deleted_by" text;--> statement-breakpoint
ALTER TABLE "productions" DROP CONSTRAINT IF EXISTS "productions_show_id_shows_id_fk";--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" DROP CONSTRAINT IF EXISTS "productions_season_id_seasons_id_fk";--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" DROP CONSTRAINT IF EXISTS "scenes_production_id_productions_id_fk";--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_show_id_shows_id_fk";--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" DROP CONSTRAINT IF EXISTS "shots_production_id_productions_id_fk";--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" DROP CONSTRAINT IF EXISTS "shots_scene_id_scenes_id_fk";--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" DROP CONSTRAINT IF EXISTS "takes_shot_id_shots_id_fk";--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;
