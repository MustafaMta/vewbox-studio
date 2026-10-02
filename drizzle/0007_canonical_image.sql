ALTER TABLE "assets" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "character_usage" ADD COLUMN "canonical_image_version" integer;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "canonical_asset_id" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "canonical_image" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_canonical_asset_id_assets_id_fk" FOREIGN KEY ("canonical_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;