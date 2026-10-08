# CLEAN VALIDATION RESTART — 2026-10-09

The producer reset the ACTIVE production data and restarted product validation from the foundation: persistent
performers first, then everything built on identities that are already proven. This is not a source-code or a
model-stack rollback; every proven engineering fix is kept.

The previous validation (2026-10-07 → 2026-10-09: "The Relief", "The Last Crossing", "The Night Ferry", "Harbour
Lights") is **historical engineering evidence only**, never current acceptance evidence:
[docs/history/PRODUCTION-EXECUTION-STATUS-2026-10-07_to_2026-10-09.md](history/PRODUCTION-EXECUTION-STATUS-2026-10-07_to_2026-10-09.md).

## Reset

| Step | Status |
| --- | --- |
| All creative generation stopped (no active or queued jobs; nothing restarts on its own) | DONE |
| Inventory and audit manifest ([docs/history/CLEAN-RESET-2026-10-09-manifest.json](history/CLEAN-RESET-2026-10-09-manifest.json)) | DONE (dry run) |
| Old generated content deleted (`scripts/clean-production-reset.ts --apply --i-understand-this-deletes`, run by the producer) | `WAITING_FOR_USER` |
| Active database clean (0 productions, shows, seasons, episodes, characters, locations, songs, takes, jobs) | pending the reset |
| Active library clean (no generated media under `D:\vewbox-data\library`) | pending the reset |
| Source, git history, model weights (`D:\models`), registries, settings, tests, documentation, LAB fixtures | PRESERVED |

What the reset removes:
- 4 productions, 1 show, 1 season, 6 scenes, 38 shots, 34 takes;
- 5 characters, 2 locations, 198 assets;
- 112 jobs and their history;
- 313 library files (258 MB).

## Validation order (one layer at a time; no layer is used before it is accepted)

Character identity → spoken voice identity → multi-language voice identity → singer identity → location identity →
story / world state → storyboard → single shot → two-shot continuity → small scene → short → music video → show /
season / episode.

## Phase 1 — Character foundation (the only creative phase allowed)

- **Allowed:** the brain (Qwen3.8) writes the character sheet; Qwen-Image-2512 draws exactly one canonical front
  full-body image; MOSS-TTS v1.5 speaks the English voice.
- **Not allowed:** MiniMax H3 (no video of any kind), songs and storyboards.
- **Clean set:** A Realistic Actor + Singer, B Anime Actor, C Cartoon Singer — in that order, each only after the
  previous one is technically correct.
- **First-attempt rule:** one request, one output, inspect. On a defect: keep the failed artifact, fix the root cause,
  then one explicit regeneration of that asset.
- **Iraqi voice:** `IRAQI_PRODUCTION_REFERENCE = WAITING_FOR_USER` (a consented, fluent Baghdadi recording). No Iraqi
  production sample before it. Engine choice by the producer's blind listening only; Fish is evaluation only.
- **End of Phase 1:** a review package for the producer, then `WAITING_FOR_USER_ACCEPTANCE` — and STOP.

| Character | Canonical image | Character sheet | English voice | Iraqi voice | Status |
| --- | --- | --- | --- | --- | --- |
| A — Realistic, Actor + Singer | not started | not started | not started | `WAITING_FOR_USER` reference | waiting for the reset |
| B — Anime, Actor | not started | not started | not started | — | after A |
| C — Cartoon, Singer | not started | not started | not started | — | after B |

## Open producer items carried over

- `IRAQI_PRODUCTION_REFERENCE = WAITING_FOR_USER`.
- The Iraqi listening pack (LAB; `var/eval/iraqi-listening-2026-10`, Habibi and MOSS arms made, Fish pending) stays a
  LAB comparison; no engine is chosen from it until the producer listens.
- `WAITING_FOR_USER_HARDWARE_CHECK`: two unexpected power losses on 2026-10-08 (Windows Kernel-Power 41, no crash
  record).
