# CLEAN PRODUCTION VALIDATION RESTART — 2026-10-09

The producer rejected the previous generated creative data and restarted product validation from the foundation:
persistent performers first, then every later layer built on identities that are already proven. This is not a
source-code or a model-stack rollback; every proven engineering fix is kept. From this point only NEW artifacts count
toward production acceptance.

The previous validation (2026-10-07 → 2026-10-09) is **engineering history only**:
[docs/archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md](archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md).

## Reset — DONE (2026-10-09)

| Item | Result |
| --- | --- |
| Creative generation stopped (no active or queued jobs; the Fish image build stopped; Fish weights kept, verified) | DONE |
| Rejected creative data removed (`scripts/clean-production-reset.ts --apply`, the producer's explicit authorisation) | DONE |
| Active database | 0 productions, shows, seasons, episodes, shorts, music videos, characters, locations, scenes, shots, takes, assets, jobs, events, leases |
| Active library `D:\vewbox-data\library` | 0 files (313 files, 258 MB removed) |
| Recoverability | The removed media folders and a metadata dump of the removed rows are in the Windows Recycle Bin until it is emptied; no other copy was made |
| Audit record | [docs/archive/CLEAN-RESET-2026-10-09-manifest.json](archive/CLEAN-RESET-2026-10-09-manifest.json): timestamp, database counts, generated files and bytes, model-store size (427.6 GB), git commit |
| Source, git history, model weights (`D:\models`), model / licence / agent registries, settings, migrations, tests, infrastructure, engineering fixes | PRESERVED |
| Application | starts, connects, health 200, registries loaded (304 models), the UI opens on an empty cast |
| LAB fixtures | outside the production library (`var/eval`) |

## Validation order (one layer at a time; no layer is used before the producer accepts it)

Character visual identity → persistent voice identity → multilingual same-person voice → singing identity → locations →
world / story → storyboard → one video shot → two-shot continuity → small scene → short → music video → show / season /
episode.

## Phase 1 — Characters + voice identity (the only creative phase)

- **Allowed:** Qwen3.8 writes each character sheet; Qwen-Image-2512 draws ONE canonical front full-body image (neutral
  pose, neutral expression, no temporary condition); a designed original voice per character (VoxCPM2 design: no real
  person cloned); MOSS-TTS v1.5 speaks English; Habibi IRQ and MOSS Arabic each speak the Iraqi lines once, for the
  producer's listening.
- **Not allowed:** MiniMax H3, video of any kind, songs, locations, stories, shows.
- **The image is the visual authority:** once a canonical image is technically correct, the character's metadata is
  corrected to describe that image.
- **First-attempt rule:** one request, one output, inspect; a defect → keep the failed artifact, fix the root cause,
  one explicit regeneration of that asset.
- **Iraqi:** no engine is chosen and nothing is promoted from machine scores; Fish stays evaluation only.

| Character | Style | Performs | Languages | Canonical image | Voice | English samples | Iraqi samples | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Realistic | Actor + Singer | English, Iraqi Arabic | — | — | — | — | starting |
| B | Anime | Actor + Singer | English, Iraqi Arabic | — | — | — | — | after A |
| C | Cartoon | Actor + Singer | English, Iraqi Arabic | — | — | — | — | after B |

`PHASE_1` ends at `WAITING_FOR_USER_ACCEPTANCE` with a review package; nothing proceeds without the producer.

## Open producer items

- `WAITING_FOR_USER_HARDWARE_CHECK`: two unexpected power losses on 2026-10-08 (Windows Kernel-Power 41, no crash
  record).
- The Iraqi listening pack (LAB, upstream demo speaker) stays a LAB comparison only.
