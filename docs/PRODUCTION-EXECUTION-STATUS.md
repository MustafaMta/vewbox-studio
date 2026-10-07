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
- **Remaining blocker:** none for Phase 1. Open: decode speed (try decode-only CUDA graphs once stability is proven);
  shot-length overrun (2) and the lens/window slip (3) belong to the shot-planning work of the filming phases; old LLM
  weights (Ollama 54 GB: Qwen3.6, Gemma; FP8 30.9 GB) are deleted only after NVFP4 has run stably, with the
  producer's approval.
