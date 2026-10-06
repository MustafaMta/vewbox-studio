# Documentation index

One line per document; what it is for. Start with the handoff (`NEW-SESSION-HANDOFF-2026-10-06.md`) and the directive.

## Current direction and system

- [directives/PRODUCTION-STACK-DIRECTIVE-2026-10-06.md](directives/PRODUCTION-STACK-DIRECTIVE-2026-10-06.md) — the current producer directive: frozen model stack, priorities, acceptance gates.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the system is built: command engine, jobs and lanes, GPU lease, video/story/sound pipelines, where code lives.
- [BACKEND-AUDIT-2026-10.md](BACKEND-AUDIT-2026-10.md) — the backend design record whose finding ids (C3, H9, …) and steps code comments cite.
- [CHARACTER-CONTINUITY.md](CHARACTER-CONTINUITY.md) — the regeneration rule: appearance and voice lock once a character is in a video.

## Models, licences, storage

- [MODELS.md](MODELS.md) — every model: files, service, licence, VRAM/latency; model-size and promotion policy.
- [research/MODEL-EVAL-2026-10.md](research/MODEL-EVAL-2026-10.md) — the model promotion record (decisions, measurements, open items).
- [research/GPU-STAGING-2026-10.md](research/GPU-STAGING-2026-10.md) — GPU families, staging order and measured peaks (the lease estimates; a unit test reads §6).
- [research/VOICE-BENCH-2026-10.md](research/VOICE-BENCH-2026-10.md) — the English voice benchmark behind MOSS-TTS v1.5 (next phase: English voice).
- [MODELS-STORAGE.md](MODELS-STORAGE.md) — the D:\models store (VHDX), its layout, migration record and reclaiming C:.
- [LICENSES.md](LICENSES.md) — licences and obligations per engine; commercial-safe-only policy (mirrors `src/domain/licences.ts`; a unit test reads it).
- [licences/habibi-tts-README-2026-10-03.md](licences/habibi-tts-README-2026-10-03.md) — licence evidence: the Habibi-TTS model README as read on 2026-10-03.

## Operations, setup, testing

- [SETUP.md](SETUP.md) — first install: requirements, `.env`, weights, start, host development.
- [OPERATIONS.md](OPERATIONS.md) — services and ports, health, logs, jobs, GPU, storage, repository, resume, reset, security.
- [OPERATIONS-BACKUP.md](OPERATIONS-BACKUP.md) — backup and restore procedure and drill.
- [TESTING.md](TESTING.md) — the test commands, the browser regression suite, when to run what.
- [testing/REAL-FAULT-PROCEDURES.md](testing/REAL-FAULT-PROCEDURES.md) — real-hardware fault and recovery procedures.
- [testing/CONTINUITY-VALIDATION-SHOTS.md](testing/CONTINUITY-VALIDATION-SHOTS.md) — continuity validation shots and start thresholds for the film gates.

## Contracts (current APIs and rules)

- [CONTRACTS-IDENTITY-PACK.md](CONTRACTS-IDENTITY-PACK.md) — one character = one canonical front full-body image (v2).
- [CONTRACTS-VOICE-IDENTITY-V2.md](CONTRACTS-VOICE-IDENTITY-V2.md) — persistent voice identity: origins, designed voices (Rule V-DESIGN), checks.
- [CONTRACTS-CHARACTER-VOICE.md](CONTRACTS-CHARACTER-VOICE.md) — the wave-2 character/voice contract, valid where the two above do not change it.
- [CONTRACTS-AUTO-IDEA.md](CONTRACTS-AUTO-IDEA.md) — research-driven Auto Idea: types, jobs, tables.
- [CONTRACTS-PHASE2-STUDIO.md](CONTRACTS-PHASE2-STUDIO.md) — the Studio Company: agents, tools, skills, runs.
- [CONTRACTS-REDESIGN-BACKEND.md](CONTRACTS-REDESIGN-BACKEND.md) — the redesign's backend additions (cut notes, ratings, run phases, thumbs, frame posters).

## Film pipeline

- [AUDIOVISUAL-QA.md](AUDIOVISUAL-QA.md) — audiovisual defects found in real output, root causes, and the H3 experiments (E0–E2c).
- [research/CONTINUITY-GAPS-2026-10-06.md](research/CONTINUITY-GAPS-2026-10-06.md) — index of the continuity implementation (boundaries, guides, re-anchoring) for the filmmaking phase.

## Interface (English-only website)

- [design/VISUAL-STANDARD-V5.1.md](design/VISUAL-STANDARD-V5.1.md) — the binding visual standard.
- [design/PAGE-ENGINEERING-BRIEF.md](design/PAGE-ENGINEERING-BRIEF.md) — the binding brief for every frontend engineer.
- [DESIGN-SYSTEM-V5.md](DESIGN-SYSTEM-V5.md) — v5 "Viewfinder"; still governs what v5.1 does not mention (IA §7, vocabulary §6, §6.7, accessibility §10, English-only §9, players §5.13, workspace).

## Iraqi Arabic phase

- [voice/IRAQI-EVAL-SET-2026-10.md](voice/IRAQI-EVAL-SET-2026-10.md) — the Iraqi evaluation set, harness and listening review (a unit test reads it).
- [voice/IRAQI-ENGINE-COMPARISON-2026-10.md](voice/IRAQI-ENGINE-COMPARISON-2026-10.md) — the prepared Iraqi engine comparison.

## Evidence still in the repo

`evidence/` keeps only files unit tests read: `acceptance-v1/resume.json` (resume-checks), the four
`model-eval-2026-10/llm/*/design-run*.json` (design-enums) and `model-eval-2026-10/voice-en/one-word/results.json`
(lead-in). Scripts still write their run evidence under `docs/evidence/` by default; generated media stays git-ignored.

## Archived

Older directives, design systems, prototypes, audits, session records, finished research and `docs/evidence/**` were
archived on 2026-10-06 to `D:\vewbox-data\archive\repo-docs-2026-10-06\` (same `docs/`-relative paths) and remain in git
history (`git show df74b50c:docs/<path>`). Citations of those paths in the documents above and in code comments are
provenance; read them there.
