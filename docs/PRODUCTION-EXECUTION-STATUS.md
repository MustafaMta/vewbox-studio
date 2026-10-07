# Production execution status

One record per phase of the master plan (producer directive 2026-10-07). Evidence files live under
`docs/evidence/<phase>/` (git-ignored, kept on this machine).

## Phase 0 — Qwen3.8 production brain — DONE (2026-10-07)

- **Commit:** branch `phase1/qwen3.8-planner`, merged to `main` (see the merge commit after `Phase 0:` commits).
- **Models active:** `Inferact/Qwen3.8-27B-NVFP4` @ `6128240e` (Apache-2.0; 22 files, 26,404,416,448 bytes, sha256
  verified) on vLLM 0.31.0 (`vllm/vllm-openai:v0.31.0@sha256:c1c9f6fd…`, CUDA 13.0), compose service `llm-vllm`:
  TP 1, `--max-model-len 32768`, FP8 KV cache, `--enforce-eager`, qwen3 reasoning parser, `--max-num-seqs 2`,
  `--gpu-memory-utilization 0.90`, thinking off by default. It is the ONLY planner: the Ollama route (Qwen3.6, Gemma),
  the hosted MiniMax-text / Anthropic routes and the remote OpenAI-compatible route are removed from code, compose
  and configuration; an unconfigured or non-local planner fails with the reason.
- **Measured:** cold start to healthy 92 s (weights 9.8 s, engine init 36 s incl. one-time FlashInfer autotune);
  weights 24.18 GiB, KV 2.29 GiB = 57,040 tokens (1.74 × 32K); VRAM 29,976 MiB peak answering; container RAM 5.6 GiB;
  decode 12.9–13.4 tok/s; first token ≈ 0.2 s warm (6.9 s on the very first request); a 9,947-token prompt read in
  1.3 s; sleep level 2 in 0.4 s (1,698 MiB of CUDA context stays), wake 6.1 s (11.7 s through the lease).
- **Real artifact:** the Short "The Lamp Keeper" (`short-a8b550d0ab`) planned through the real UI: Develop the story
  → Write the script → Plan the shots. One character (Ruth, 72), one location (Blackrock Lighthouse lantern room), one
  scene, 4 shots with full continuity state (poses, eyelines, screen direction, props with owners, camera, lighting,
  boundaries) and World Bible revisions. Direct test 7/7 (text, JSON by prompt, JSON by schema, 2,119-token answer,
  instruction following, 9,947-token recall, over-context refusal).
- **First-attempt result:** 3 jobs, 3 LLM calls, 0 repairs, 0 truncations, 0 reasoning leaks, each job attempt 1
  (101 s, 37 s, 285 s). Live re-check after the route removal: asleep → woken by the app → schema-valid on attempt 1.
- **Defects found:** (1) decode is 13 tok/s, half of the retired Qwen3.6 (25) — `--enforce-eager` disables CUDA
  graphs; (2) the shot plan ran 20 s for a 15 s short and 4 shots where 3 were asked — `fitDurations` only stretches,
  never trims (`src/server/story/engine.ts:654`); (3) shots 3–4 stage the scratched message on the window glass where
  the script puts it on the lamp lens; (4) shot 2's screen direction contradicts its motion; (5) a non-word
  ("beneathfoot") in the live check; (6) the "Story engine" user setting (`llmProvider`) still exists (not honoured).
- **Root causes fixed:** shot-plan deadlines were sized on the retired Ollama window (16,384) instead of the planner's
  32,768 (`src/server/jobs/work-deadline.ts`); the planner's speed/VRAM figures were placeholders (25 tok/s,
  31,500 MiB) — now the measured 13 tok/s and 30,000 MiB; the story agents named "qwen3:14b (Ollama) or the configured
  hosted LLM" — now the planner.
- **Remaining blocker:** none for Phase 1. Open (Phase 0): decode speed (try decode-only CUDA graphs once stability is proven);
  shot-length overrun (2) and the lens/window slip (3) belong to the shot-planning work of the filming phases; old LLM
  weights (Ollama 54 GB: Qwen3.6, Gemma; FP8 30.9 GB) are deleted only after NVFP4 has run stably, with the
  producer's approval.

## Phase 1 — Character + persistent voice — DONE, listening pending (2026-10-07)

- **Commit:** `main` (Phase 1 commits after `90ac641`).
- **Models active:** Qwen3.8-27B-NVFP4 (character sheets), Qwen-Image-2512 fp8 (canonical figures, ComfyUI 0.38.1),
  VoxCPM2 (one designed voice seed per character), MOSS-TTS v1.5 (8B Delay; every spoken line), Whisper large-v3
  (heard-back checks), ECAPA (speaker similarity). Services: `comfyui`, `tts-design`, `tts-moss`, `asr`.
- **Built:** performer kind ACTOR / SINGER / ACTOR_SINGER in domain, DB (migration 0028), creation UI ("Performs", with
  singing voice and styles for a kind that sings), character page (slate + Performs section) and cast directory (label
  under the name, filter); the singing profile is stored apart from the spoken voice.
- **First-attempt policy enforced in this path:** canonical image drawn ONCE (no automatic redraw); voice design makes
  ONE voice (no best-of-3, no candidate grid); the voice seed is the character's (a retry makes the same voice);
  dialogue lines failing their gate are kept and flagged, never re-spoken automatically.
- **Real artifacts (through the UI):** Walter Finch — Actor, Cartoon; Hana Kisaragi — Singer, Anime (soprano; ballad,
  city pop); Marcus Bell — Actor + Singer, Realistic (baritone; soul, gospel). Each: one canonical full-body front
  figure (inspected, approved), one designed voice pinned to MOSS, the proof line and three different requested
  sentences. 12/12 lines heard back exactly (CER 0). Speaker similarity (ECAPA, mean over each character's 4 lines):
  within a character 0.806 / 0.773 / 0.759, across characters 0.106–0.194 — one persistent, distinct voice each
  (`scripts/voice-identity-matrix.ts`). Creation 2:03–2:13 per character (design ~60 s, figure ~60 s), voice build
  60–127 s, a line ~14 s.
- **First-attempt result:** 20 of 21 jobs on attempt 1. The exception: Hana's design needed 3 job attempts (see root
  causes).
- **Defects found:** (1) side-specific details are mirrored in 4 of 4 cases (pencil ear, hair streak, ring hand, brow
  scar) — Qwen-Image places "left/right" from the viewer; a measured A/B (15/24 either way) showed prompt wording does
  not fix it, so the approved image is the authority and the written sheet can contradict it; (2) Marcus reads older
  than 41 (all-grey hair and beard for "greying at the temples") and his "small healed scar" was drawn as a fresh red
  cut; (3) planner sheet slips: boots inside Walter's face field, a garbled wardrobe ending, "clean-shaven; no facial
  hair" for Hana; (4) the creation form remembers the previous character's kind and singing range (convenient, but a
  soprano can carry over); (5) MOSS takes emotion only from its reference, so gruff / proud / kind lines cannot be
  steered per line — to be judged by ear; (6) unconfirmed: the cast directory figures looked dull in the pane's
  screenshots (CSS and the thumbnail file are normal).
- **Root causes fixed:** the character-design schemas capped look fields at 80–200 characters while the character
  record stores 400 — Qwen3.8 writes 130–250 and cannot count characters, so three repair rounds failed and the job
  re-ran (Hana); the caps now equal the record's and the prompt asks for one short sentence per field (Marcus: 0
  repairs); the same latent cap in story development's invented characters fixed. The voice health check probed the
  retired IndexTTS service and reported the voice engine down; it now probes the configured English engine (MOSS).
  The creation form put Style beside the singing fields; the singing fields now have their own row.
- **Remaining blocker:** the producer must LISTEN — naturalness, emotional range and pronunciation are not claimed by
  any measurement (each character's page plays the voice and every line; "I listened" records the judgement).
