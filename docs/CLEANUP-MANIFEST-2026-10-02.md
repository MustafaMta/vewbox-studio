# Phase 0 cleanup manifest — 2026-10-02

Directive: "Phased rebuild of the AI film studio", Phase 0. Machine-readable manifest (every asset row, every library
file, the ComfyUI volume listings): `var/backups/phase0-cleanup-20261002-2347/manifest.json`. Tool:
`scripts/studio-cleanup.ts` (`plan` writes the manifest and changes nothing; `execute` refuses without a manifest,
with job intake open, or with jobs running).

## Before anything was removed

1. Job intake paused (`scripts/studio-intake.ts pause …`): the API answers new jobs with 503 and the reason, workers
   claim nothing; `/api/health` shows `intake.paused`.
2. The host worker was stopped. No job was running (91 completed, 1 awaiting review).
3. The whole database is dumped with `pg_dump -Fc` into the backup directory before any row is deleted.

## What is removed (moved or archived into the backup, restorable)

| Table | Rows | Action |
|---|---|---|
| `shows` | 1 | remove (empty studio) |
| `seasons` | 2 | remove (empty studio) |
| `productions` | 4 | remove (empty studio) |
| `scenes` | 8 | remove (empty studio) |
| `shots` | 43 | remove (empty studio) |
| `takes` | 27 | remove (empty studio) |
| `continuity_versions` | 94 | remove (empty studio) |
| `characters` | 8 | remove (empty studio) |
| `character_usage` | 52 | remove (empty studio) |
| `locations` | 3 | remove (empty studio) |
| `assets` | 182 | remove (empty studio) |
| `jobs` | 92 | remove (operational history of the old work) |
| `job_events` | 251 | remove |
| `agent_runs` | 96 | remove |
| `studio_events` | 389 | remove |
| `handoffs` | 39 | remove |
| `qa_reports` | 56 | remove |
| `approvals` | 4 | remove |
| `reliability_events` | 3 | remove |
| `metrics` | 510 | remove |
| `proposals` | 3 | remove |

Content: the acceptance productions "The Lamp Shop" and "بيت أبو كريم" (show, 2 seasons, 3 episodes), their 8
characters, 3 locations, and 182 media assets — generated images 75, generated videos 27, generated audio 4, derived
audio 21, derived images 31, derived videos (cuts/exports) 4, subtitles 16, and 4 uploaded test recordings (copies of
`tests/fixtures/speech-en.wav` and earlier test clips; their sources stay where they are).

Files: `var/library` (182 files, 457 MB) is **moved** to the backup directory and recreated empty. Stray build/test
logs in `var/*.log` are moved to `logs/` in the backup. ComfyUI scratch volumes `vewbox_comfyin` (66 staged inputs,
64 MB) and `vewbox_comfyout` (102 outputs, 141 MB) are archived as `.tar.gz` into the backup, then emptied; the
volumes themselves stay.

## What is kept

| Kept | Why |
|---|---|
| `departments` 9, `agents` 51, `tools` 18, `skills` 11 | the organisation, re-synced from code on every start |
| `models` 35, `workflows` 15 | the model and workflow registry |
| `settings`, `studio_meta`, migrations | studio settings and schema state |
| Docker `vewbox_models`, `vewbox_ollama` | model weights |
| Docker `vewbox_pgdata` | the database itself (rows cleaned, volume kept) |
| Docker `vewbox_nvjit`, `vewbox_workertmp` | compiler cache; empty scratch |
| Docker `volexar-studio_models` | not this compose project — not touched |
| Repository, Git history, `docs/evidence` | source and the record of earlier acceptance runs |
| `.env`, `.env.local` | credentials |
| `var/backups/*` (earlier backups) | the producer decides when to purge them |
| Sample-studio code and bundled sample media | preserved; a fresh database now starts **empty** instead of seeding the sample |

## Restore

`pg_restore -U vewbox -d vewbox --clean database.dump` (inside the db container), move `library/` back to
`var/library`, and untar the two volume archives into their volumes.
