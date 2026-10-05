# Cloud session record — continuity-first pipeline (2026-10-05 →)

Binding: `docs/directives/CLOUD-SESSION-DIRECTIVE-2026-10-05.md` (+ the producer's additions §19–§22). Branch
`cloud-session`. No GPU in this session: nothing here was generated, simulated or faked. Fixture-based tests (ffmpeg
`lavfi` test clips, synthetic frames and audio, the continuity fixture studio) prove logic, state and failure handling
only — **they are not film-generation acceptance**. Research: `docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md`.

Status words: **DONE (cloud)** — implemented, typecheck and tests pass, nothing about it needs the GPU.
**READY FOR LOCAL GPU ACCEPTANCE** — implemented and tested in the cloud, capability/config defined, failure handling
in place, and `scripts/resume-local.mjs` + the §16 gates know how to exercise it; only real-generation evidence is
missing. **NOT READY** — what is still missing is named.

## Ledger

| # | Change | Problem solved | Implementation | Alternatives considered | Model/tool assumptions | Tests | Cloud result | Needs the GPU | Status |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Continuation settings as capability data | §6: the 22-frame guide was a constant; a wrong length would be floored silently by the node | `src/domain/video-capability.ts` (MiniMax H3 local/API records: grid, range, guide quantisation, audio-latent rate, refs, default + allowed guide lengths); `resolveContinuation` shot > studio > engine; invalid choice set aside with the reason (preflight warning `continuation-choice-set-aside`); take records `params.guide.settings`; `Shot.continuation`, `settings.generation.continuation` (migration 0027) | keep constants; a free integer (rejected: the node floors 21 → 5) | ComfyUI v0.38.1 `MiniMaxH3AddGuide` quantisation 17k+5 (read on the workstation, STORYBUILDER-INTEGRATION §b.2) | `tests/unit/video-capability.test.ts` (12) | pass | whether 5 / 39 frames ever beat 22 (gate 4–5) | READY FOR LOCAL GPU ACCEPTANCE |
| C2 | Production context per shot | §4: state lived partly in prompts; condition, emotion, poses, motion, knowledge, persistent changes were not stored | `src/domain/production-context.ts` — character / location / shot / story state from stored records, every fact with its source, gaps named, hashed; `ContinuityState` gains condition, interactingWith, startPose, endPose, motion, constraints; `Scene.story` (events, knowledge, persistent changes, relationships; migration 0027); prompt sentences (`contextLines`, people as bound subjects, never names); take records `params.context` (hash + compact copy) | an LLM "memory" summary per scene (rejected by the directive); one big JSON blob per production (rejected: no per-fact source or scope) | — | `tests/unit/production-context.test.ts` (14) | pass | does H3 honour start/end pose and motion sentences (gate 4) | READY FOR LOCAL GPU ACCEPTANCE |
| C3 | Re-anchoring long continuous chains | §9: drift accumulates through chained tails | chain length in the context; past `REANCHOR.after` (4, START; settings `reanchorAfter`) the next continuous shot anchors the shortest guide (5 frames: motion) so the canonical images dominate; a shot's own guide length wins; preflight warning `re-anchor` | forced cut back to canonical (research §A, stronger; the GPU comparison decides); periodic regeneration from canonical frames (no H3 mechanism) | identity drift along tails (community reports, research §A) | in `production-context.test.ts` | pass | the chain-depth G-tests (gate 5) | READY FOR LOCAL GPU ACCEPTANCE |
| C4 | Continuity QA without a model | §10: fades, duplicated frames, unplanned in-take cuts, repeated speech, line timing, container | `src/server/media/continuity-qa.ts` (64×36 grey series; START thresholds); in `GENERATE_TAKE` after the speech check, REVIEW flags in the take's continuity report — never a rejection or a regeneration | PySceneDetect (Python; ffmpeg-only here), mpdecimate (counts only) | — | `tests/unit/continuity-qa.test.ts` (9, incl. ffmpeg-made fade/splice clips) | pass | calibrate every START threshold over real takes | READY FOR LOCAL GPU ACCEPTANCE |
| C5 | First-attempt reliability | §11: avoidable failures cost generations; attempt #1 not told apart | engine readiness from the exact graph (nodes + model files listed by ComfyUI, cached 60 s), library free space, before queueing (`INFRASTRUCTURE` / `RESOURCE_EXHAUSTION`); preflight: draft canonical image refused before first use, dialogue must fit the clip, context gaps as warnings; take `params.attempt` (`firstAttempt`, `shotGeneration`, `jobAttempt`) | a static model list (rejected: drifts from the builder) | ComfyUI `/object_info`, `/models/{folder}` | `tests/unit/readiness.test.ts` (6), `video-provider.test.ts` (+2) | pass | first-attempt rate over the gates | READY FOR LOCAL GPU ACCEPTANCE |
| C6 | Music video performance | §8 | `src/domain/music-performance.ts` (per-line plan: lead/backing, aligned timing, instrumental = nobody); prompt: lead words, backing harmonies, everyone else lips closed, extras never sing; preflight `cuts-sung-line`, `non-performers-in-shot`; `src/server/media/song-copies.ts` — a second copy of the song in the cut (REVIEW, `AUDIO_DUPLICATION`) | per-shot singers only (the old model: no backing, no line timing) | — | `tests/unit/music-performance.test.ts` (6) | pass | singing lip-sync, extra-singer frequency, H3 lyric tags (gate 10) | READY FOR LOCAL GPU ACCEPTANCE |
| C7 | Acceptance open items 1–7 | `docs/evidence/acceptance-v1/REPORT.md` "Still open" | frames drawn at the shot's framing (plate = place, not camera); last name pass on every prompt outside `<d>`; recovered take records engine time; subtitle tracks by script; people count kept on a frame, shown, preflight refuses; plate check only at wide framings; Final cut counts speaking characters with a voice identity | — | — | `acceptance-open-items.test.ts` (7), `prompt-names.test.ts` (2), `take-continuity.test.ts` (+1) | pass | item 1 (framing) and 6 (plate check) on new takes | READY FOR LOCAL GPU ACCEPTANCE |
| C8 | One-command local resume | §14 | `scripts/resume-local.mjs` (plan / `--go` / `--from` / `--start-app` / `--resume-intake`), pure judgements `scripts/lib/resume-checks.mjs` | a PowerShell-only script (rejected: untestable in the cloud) | Docker Desktop + WSL, compose project `vewbox`, volume `vewbox_models` | `tests/unit/resume-checks.test.ts` (6) | plan mode runs | the run itself | READY FOR LOCAL GPU ACCEPTANCE |
| C9 | Shot page: people and story state; scene story editor | §4, §12 continuity screens | `ShotContext.tsx` (per-person state editor, the resolved context and its gaps); `SceneStory.tsx` (events, persistent changes, knowledge) | — | — | browser: see below | — | — | DONE (cloud) when the browser run passes |
| C10 | Library paths on Linux | the first cloud test run: `..\x` was not refused off Windows | backslash is a separator on every platform | — | — | `media-paths.test.ts` | pass | — | DONE (cloud) |

## Checks at this checkpoint

- `pnpm typecheck` clean; `pnpm test` 159 files / 1452 passed, 2 skipped.
- `pnpm test:worker` 83 / 84: the one failure is `tests/worker/minimax.test.ts` "with a wrong key", which calls the real
  `api.minimax.io` — the cloud egress proxy answers HTTP 403 before MiniMax does. Environment, not code; it passes on
  the workstation.

## Not done yet in this session (next)

- Audio-first dialogue: forced alignment (`/align`) and the lip-sync checks (`/qa/mouth`, `/qa/identity`) in the ASR
  container, their client, and their wiring into the take and the line recording — in progress.
- Optional lip-sync correction (LatentSync 1.6): blocked on two producer decisions (research §C: the InsightFace
  detector swap; `AUDIO-STACK.md` "LatentSync excluded by policy").
