-- The unused table (docs/BACKEND-AUDIT-2026-10.md section 6.5, step 17). Idempotent (IF EXISTS).
-- continuity_versions was written by the saver on every continuity change (a copy of the shot's continuity state per
-- version) and never read by anything. Existing rows: the table and ALL its rows are dropped. Nothing else changes:
-- every shot's current continuity stays where it is read from (shots.continuity); no foreign key points at the table.
-- Take a backup first (scripts/backup.ts, docs/OPERATIONS-BACKUP.md) if the history should be kept.
-- Rollback: revert the code; recreate the table from 0000_initial.sql's definition (the dropped rows come back only
-- from a backup).
DROP TABLE IF EXISTS "continuity_versions" CASCADE;
