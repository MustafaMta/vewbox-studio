# Models

Every model the studio uses, where it runs, why it was chosen, and what it costs on the RTX 5090 (32 GB). Weights are
pinned by repository, file name and SHA-256 in `docker/models/manifest.json` and fetched into the `models` volume by
the `models` service; the voice services fetch their own weights on first boot into the same volume.

**Video is MiniMax only.** The only video generator in this system is MiniMax H3, either the hosted API or the open
weights running in ComfyUI. No LTX, Wan, Hunyuan, CogVideo, Mochi, Kling or Seedance model, weight or workflow exists
in the tree or the manifest; adding one is out of policy.

## Video

| Engine | Where | Model / files | Licence | Notes |
|---|---|---|---|---|
| MiniMax H3 (hosted) | api.minimax.io `/v2/video_generation` | `MiniMax-H3` (768P/1080P, 4–15 s, native audio, dialogue tags, first/last frame or up to 9 image + 3 audio references) | MiniMax terms, per-second billing | chosen automatically when `MINIMAX_API_KEY` is set (`VIDEO_BACKEND=auto`) |
| MiniMax H3 (local) | `comfyui` on the 5090 | `minimax_h3_fl2va_pruned_int8_convrot` (21 GB DiT), `qwen3vl_32b_minimax_h3_nvfp4_awq` text encoder (15.7 GB), video VAE int8 (2.8 GB), audio VAE fp32 (0.6 GB), `fl2v_turbo_8step` LoRA | MiniMax H3 Community License (commercial use under US$20M/yr, "MiniMax H3" attribution; excludes EU/UK/Korea/USA territories) | first/last-frame → video with audio, 8-step turbo; the pruned int8 build is what fits 32 GB |
| MiniMax H3 reference (local) | `comfyui` | `minimax_h3_ref2va_pruned_int8_convrot` (21 GB) + `ref2v_turbo_4step` LoRA | as above | reference images/audio → video; used for shots without a drawn opening frame |

The worker never loads both H3 variants at once (the GPU lease switches families and asks ComfyUI to free memory).

## Images

| Purpose | Model | Files | Licence |
|---|---|---|---|
| Character sheets, location views, storyboard frames (edit from up to 3 references) | Qwen-Image-Edit-2511 | `qwen_image_edit_2511_fp8mixed` (20.5 GB), `qwen_2.5_vl_7b_fp8_scaled` encoder (9.4 GB), `qwen_image_vae`, Lightning 4-step LoRA | Apache-2.0 |
| Text to image (portraits, plates from nothing) | Qwen-Image-2512 | `qwen_image_2512_fp8_e4m3fn` (20.4 GB), same encoder/VAE, Lightning 8-step LoRA | Apache-2.0 |

Three visual directions (Cartoon, Anime, Realistic) are prompt languages on the same models (`src/server/story/style.ts`),
so a character keeps one identity across productions and directions are genuinely different in design, lighting and camera.

## Voices and transcription

| Purpose | Engine | Where | Licence | Notes |
|---|---|---|---|---|
| English and Arabic voices with cloning from a short recording | IndexTTS 2.5 | `tts` service (python 3.11, torch 2.8 cu128) | Apache-2.0 (code), model licence per repository | emotion control; `use_cuda_kernel=False` on Blackwell |
| Iraqi Arabic voices | Habibi-TTS IRQ (F5-TTS based) | `tts-habibi` service | Apache-2.0 | dialect-specialised; chosen automatically for `IRAQI_BAGHDADI` |
| Transcript check and subtitle timing | faster-whisper large-v3 (CTranslate2 fp16) | `asr` service | MIT | every generated line is transcribed back and compared with the script (word error rate recorded on the asset) |
| Hosted speech (optional) | MiniMax `speech-2.8-hd` | API | MiniMax terms | only when the character's voice identity selects it and a key exists |

## Music

| Engine | Where | Licence | Notes |
|---|---|---|---|
| MiniMax Music API (`music-3.0`) | API | MiniMax terms | only when the account has it (closed to new accounts since 2026-08-20) |
| ACE-Step 1.5 XL turbo + 0.6B text encoder + 1.7B LM | `comfyui` | MIT | default local engine; vocals from lyrics; Arabic listed as supported; the two encoders load through `DualCLIPLoader` (the first song attempt with the LM alone produced an empty conditioning) |
| MiniMax Music 3 (open weights, int8) | `comfyui` | MiniMax-Music3 Community License (UI attribution) | second local engine |

## Story engine

| Provider | Model | When |
|---|---|---|
| MiniMax (Anthropic-compatible endpoint) | `MiniMax-M3` | `LLM_PROVIDER=minimax` or `auto` with a MiniMax key |
| Anthropic | `claude-sonnet-5-5` | `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` |
| OpenAI-compatible (bundled `llm` service, Ollama) | `qwen3:14b` on the 5090 | `auto` with no hosted key; works offline |

All three return JSON validated against strict schemas with tolerant parsing (`src/server/story/lenient.ts`) and a
repair round; Arabic productions are written in dialect (Iraqi Baghdadi by default) with an English gloss.

## VRAM plan (32 GB)

| Family | Measured on the RTX 5090 | Concurrency |
|---|---|---|
| MiniMax H3 fl2va int8 + nvfp4 encoder | 22–32 GB card total while generating (DiT staged dynamically, 20 GB); 60–95 s per 3.75–5.9 s clip at 1344×768, 8 turbo steps ≈ 7 s each | 1 (ComfyUI serialises) |
| Qwen-Image-Edit fp8 + encoder fp8 | to be measured (weights in flight) | 1 |
| IndexTTS 2.5 / Habibi | to be measured | 1 (unloads on request) |
| faster-whisper large-v3 fp16 | ~3.7 GB; 6 s of speech in 1.2 s warm, 8.9 s with the first load | 1 |
| Demucs htdemucs | ~2.3 GB; 1.5 s clip in ~1 s warm, 27 s with the first download + load | 1 |
| ACE-Step 1.5 XL turbo | 34 s of engine time for a 90 s song (8 steps); plus ~30 s of Demucs for the stems | 1 |
| qwen3:14b (Ollama, Q4) | 10 GB, 100% GPU even beside ComfyUI's staged H3; ~17 s median per structured answer; unloads after 2 min idle | 1 |

`GPU_VRAM_BUDGET_MB` (default 30000) is the worker's ceiling; the GPU lease serialises families and records waits.

## Changing a model

1. Add the file to the manifest with repository, path, folder, size and SHA-256 (from the Hugging Face LFS listing).
2. Run `docker compose --profile models run --rm models`.
3. If a workflow changes, bump nothing by hand: `src/server/workflows` hashes each template, and every take records the
   hash it was generated with.
