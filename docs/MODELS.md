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
| Camera control for derived character views (`<sks> {azimuth} {elevation} {distance}`, 96 poses) | fal Qwen-Image-Edit-2511 Multiple-Angles LoRA | `loras/qwen-image-edit-2511-multiple-angles-lora.safetensors` (295 MB) | Apache-2.0 |
| Face detection for reference validation and face crops (ComfyUI core `MediaPipeFaceLandmarker`) | MediaPipe BlazeFace + Face Landmarker (Comfy-Org/mediapipe) | `detection/mediapipe_face_fp32.safetensors` (5.4 MB) | Apache-2.0 |

Three visual directions (Cartoon, Anime, Realistic) are prompt languages on the same models (`src/server/story/style.ts`),
so a character keeps one identity across productions and directions are genuinely different in design, lighting and camera.

### Character identity pipeline (wave 2, `src/server/workflows/qwen-image.ts`, `src/worker/handlers/images.ts`)

Research and the drift evidence: `docs/research/CHARACTER-IMAGE-STACK.md`. What is implemented:

| Step | Graph (registry template) | Mode | References, in order | Output |
|---|---|---|---|---|
| Portrait | `qwen-image.t2i` (or `qwen-image.edit` from an upload) | Lightning | — (or the validated upload) | 1024×1280, seed = the character's identity seed |
| Identity sheet | `qwen-image.identity-sheet` (`qwenIdentitySheet`) | **quality**: no Lightning, 24 steps, cfg 4.0, euler/simple, shift 3.1 | image1 = portrait, image2 = face crop (cut in the graph from the centre-top of the normalised portrait, upscaled to 1024²) | one 1664×1216 sheet, cut by `ImageCrop` into FRONT / THREE_QUARTER / SIDE / BACK tiles of 416×1216, plus the face crop: six files from one run |
| Derived views (FULL_BODY, EXPRESSION, OUTFIT, or a redrawn tile) | `qwen-image.view` (`qwenView`) | Lightning (+ Multiple-Angles LoRA at 1.0 when present in `/models/loras`) | image1 = FRONT tile, image2 = face crop, image3 = the sheet — always this order | per `VIEW_SPEC` (full body 832×1472, expressions 1280², …), seed = identity seed + the view's offset; a redraw bumps the previous seed by one |
| Shot frames | `qwen-image.edit` | Lightning | image1 = plate, image2/3 = each character's FRONT tile (fallback portrait); a lone character also gets the face crop | as before |
| Face check | `qwen-image.face-check` (`faceCheck`) | — | the picture | bounding boxes as text (`PreviewAny`), optional face-oval mask |

- **Identity line** (`identityLine(c)` in `src/server/workflows/identity.ts`): the fixed tokens that drifted in the first
  sheets — hair, eyes, skin, build, wardrobe, every distinguishing mark, accessories, visual restrictions — written once
  and repeated verbatim in the portrait, sheet, view and frame prompts. Stored on `character.canon.identityLine`
  (editable; a stored line wins). **Identity seed** (`identitySeedFor(c)`): `canon.identitySeed`, else FNV-1a of the id.
- Provenance on every asset: model, LoRAs, prompt, seed, the asset ids of the references given to the model, the
  workflow version, the ComfyUI prompt id and engine time. Every `CharacterRef` carries `view`, `references`, `seed`.
  The activity feed says which references were used for each picture.
- An uploaded reference is validated on the CPU (`src/server/media/image-check.ts`: short side ≥ 512, ≤ 24 MP,
  Laplacian-variance sharpness ≥ 30; face detection is **not** available on the CPU in this build) and
  `CHARACTER_APPEARANCE` refuses an unusable one with `MISSING_REFERENCE` instead of drawing from text.
- `CHARACTER_APPEARANCE` queues `CHARACTER_REFS` as a child (key `appearance:${jobId}:refs`) unless it is itself a child
  of an orchestrating job (`CREATE_CHARACTER` queues its own sheet step). A redraw never deletes the previous portrait,
  sheet or tiles; a full pack replaces the refs list, a partial redraw (`roles`) replaces only those roles.

#### One-off fetch of the two identity helpers (no fetcher image rebuild)

The manifest group `images-qwen-identity` is not in the compose `MODEL_GROUPS` default; fetch it once into the
`vewbox_models` volume (the ComfyUI container mounts it at `/models`), as root because the volume is root-owned:

```powershell
docker run --rm --user 0:0 -v vewbox_models:/models curlimages/curl:8.11.1 -sSL --fail --create-dirs -o /models/detection/mediapipe_face_fp32.safetensors "https://huggingface.co/Comfy-Org/mediapipe/resolve/main/detection/mediapipe_face_fp32.safetensors"
docker run --rm --user 0:0 -v vewbox_models:/models curlimages/curl:8.11.1 -sSL --fail --create-dirs -o /models/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors "https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors"
docker run --rm -v vewbox_models:/models alpine:latest sha256sum /models/detection/mediapipe_face_fp32.safetensors /models/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors
```

Expected hashes (the Hub's LFS oids, also in the manifest): `a98c4806…888a` (mediapipe), `42426ded…6765` (LoRA). Done on
2026-10-02: both verified; `GET /models/loras` listed the LoRA at once, `GET /models/detection` still answered `[]`
because ComfyUI cached the folder listing while the folder did not exist — it refreshes on the next ComfyUI start
(or when the folder's mtime changes again); `node scripts/check-comfy-nodes.mjs` reports it until then.
`docker compose --profile models run --rm -e MODEL_GROUPS=images-qwen-identity models` does the same through the fetcher.

#### GPU test plan — identity sheet A/B (run only when the architect says the GPU is free)

Subjects: **Nadia** `char-69c05af166` and **Abu Kareem** `char-7d1a3d6880` (both CARTOON, portraits and six old
per-view refs exist, so the "before" set is already in the library: keep it, nothing is deleted).

1. Preflight (read-only): `node scripts/check-comfy-nodes.mjs` must show every template valid and
   `detection/mediapipe_face_fp32.safetensors` present; `GET /models/loras` must list the Multiple-Angles LoRA.
2. For each character queue `CHARACTER_REFS` with no `roles` (the full pack: sheet → tiles → FULL_BODY, EXPRESSION).
   Expect one quality-mode sheet pass (watch `image.generation_ms` with `sheet: 1`; estimate 1.5–3 min, note the real
   number and ComfyUI's `engineMs`) and two Lightning view passes (~12–20 s each with three references).
3. Record in the VRAM table below: sheet pass seconds and peak VRAM (`/system_stats` during the run), derived-view
   seconds with three references and the LoRA.
4. Compare, per character, the new tiles against the old per-view refs (`refs` before the job: FRONT, THREE_QUARTER,
   SIDE, FULL_BODY, EXPRESSION drawn from the portrait alone). Look at, in this order: facial hair state (Abu Kareem:
   "No mustache" is a visual restriction — it must hold in all four tiles and the full body), hair length and tie,
   shoe colour, accessory presence (Nadia: locket and gloves in every view; Abu Kareem: keychain, antenna pin), fabric
   pattern layout, head-to-body ratio between tiles, and whether the portrait's pose or props leaked into the views.
   Then the expression grid: four heads of the same face, no body, no props.
5. Pass = every tile shows the same person with the identity-line tokens all present and unchanged (no beard/shoe/
   accessory flips) and the derived views keep them too; the old set is the baseline that failed on these very
   tokens. Fail = any token flips between tiles, a tile is not the view it is labelled (profile not a profile), or
   the sheet collapses into fewer than four figures. Partial = tiles agree but a derived view drifts: then redraw the
   view once with the LoRA off (`angleLora` false) to tell the LoRA's effect from the reference order's.
6. Face check: run `qwen-image.face-check` on each tile; expect exactly one box per tile with height ≥ 18 % of the
   tile; record the box text in the asset provenance for the next wave's identity metric.
7. Write the outcome with the asset ids and the activity lines into `docs/evidence/identity-sheet-ab.md`.

## Voices and transcription

| Purpose | Engine | Where | Licence | Notes |
|---|---|---|---|---|
| English and Arabic voices with cloning from a short recording | IndexTTS 2.5 | `tts` service (python 3.11, torch 2.8 cu128) | Apache-2.0 (code), model licence per repository | emotion control; `use_cuda_kernel=False` on Blackwell |
| Iraqi Arabic voices | Habibi-TTS IRQ (F5-TTS based) | `tts-habibi` service | Apache-2.0 | dialect-specialised; chosen automatically for `IRAQI_BAGHDADI` |
| Transcript check and subtitle timing | faster-whisper large-v3 (CTranslate2 fp16) | `asr` service | MIT | every generated line is transcribed back and compared with the script (word error rate recorded on the asset) |
| Hosted speech (optional) | MiniMax `speech-2.8-hd` | API | MiniMax terms | only when the character's voice identity selects it and a key exists |
| Voice design: a synthetic voice from a text description (EN, AR-MSA; no audio input) | VoxCPM2 (OpenBMB, 2 B), `voxcpm==2.0.3` | `tts-design` service (:8022) | **Apache-2.0** (weights and code; the card asks that AI audio be labelled and forbids impersonation) | `openbmb/VoxCPM2@32279ef`: `model.safetensors` 4 580 080 592 B `f7f964cf…891d`, `audiovae.pth` 376 951 122 B `94b5d51e…4bf1` (a PyTorch pickle: loaded only inside the container, `weights_only=True`), tokenizer + config. 48 kHz output; the 24 kHz mono copy is the line engines' reference. No dialect control: Iraqi is never designed (VOICE-IDENTITY-V2 §3.2) |
| Speaker similarity (seed↔seed, line↔reference, cast distinctness) | ECAPA-TDNN, SpeechBrain `spkrec-ecapa-voxceleb`, `speechbrain==1.1.1` | `tts-design` service, CPU | Apache-2.0 | `@0f99f2d`: `embedding_model.ckpt` 83 316 686 B `0575cb64…26a2` + hyperparams, norm, classifier, label encoder (89 MB). 192-d, L2-normalised. VoxCeleb-trained: a relative measure, never an identity or dialect proof |

#### Fetching the voice-design weights (group `voice-design`)

The group is in the compose `MODEL_GROUPS` default, so a fresh `docker compose --profile models run --rm models` fetches
it. On a machine whose fetcher image predates the group, run the fetcher image with the repository's manifest mounted
(no rebuild; resumable; every file is sha256-verified and recorded in `/models/.manifest-state.json`):

```powershell
docker run -d --name vewbox-models-fetch-voice --dns 1.1.1.1 -e HF_HUB_DISABLE_XET=1 -v vewbox_models:/models `
  --mount "type=bind,source=$PWD\docker\models\manifest.json,target=/app/manifest.json,readonly" `
  --mount "type=bind,source=$PWD\docker\models\fetch.py,target=/app/fetch.py,readonly" `
  vewbox/models:dev --manifest manifest.json --root /models --groups voice-design
docker logs -f vewbox-models-fetch-voice
```

#### First evaluation (2026-10-03, `scripts/voice-design-eval.ts` → `docs/evidence/voice-design/report.json`)

Measured on every generated file (20 WAVs + 2 line-engine renderings; ASR = faster-whisper large-v3, language forced):

- 3 descriptions × 3 candidates, loudness-matched to −20 LUFS by a static gain (VoxCPM2's own level varied from
  −30.2 to −12.4 LUFS); every file ≤ −1.0 dBTP on ffmpeg's meter, 0 clipped samples. ASR CER 0–0.041 (EN), 0 (MSA).
- ECAPA between the 3 candidates of one description 0.35–0.71: they are **different voices** (what a choice of 3 needs;
  the §5.1 "seed ↔ seed ≥ 0.80" gate is for lines of one identity, not for design candidates). Male vs female English
  voices 0.02–0.23. Same description + seed on a second run: the same voice (ECAPA 1.000), not the same bytes.
- Design → IndexTTS (one English seed, one line): ECAPA(seed, rendering) **0.66 and 0.76** in two runs (the two
  IndexTTS renderings with the same seed differ: 0.91 between them); CER 0. One sample per run is not a decision.
- Experiment, designed MSA seed → Habibi IRQ, one Iraqi line with چ/گ: ECAPA 0.81 (timbre carried); ASR
  «باسر الصبح نروح للسوبسوة. قلت لك لا تتأخر.» for «باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.» — CER 0.10
  (Iraqi fold), coverage 0.43 → contract verdict FAIL. Dialect authenticity unverified (no native listener).
- Not judged by any of this: naturalness, accent (English, MSA), Iraqi dialect, whether a voice matches its
  description. The report lists the files a listener should hear.

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
| Qwen-Image-Edit fp8 + encoder fp8 (Lightning) | engine time from `/history`: T2I 8 steps 1024×1280 11.5 s warm (75 s with the first load); Edit 4 steps, 1 reference, 1024×1280 18–22 s; 3 references 1344×768 12–13.5 s; VRAM peak not yet recorded | 1 |
| Qwen-Image-Edit fp8, quality mode (identity sheet: 24 steps, cfg 4, 1664×1216, 2 references) | to be measured in the GPU test plan above (estimate 1.5–3 min) | 1 |
| Qwen-Image-Edit fp8 + Multiple-Angles LoRA (derived view, 3 references) | to be measured in the GPU test plan above | 1 |
| IndexTTS 2.5 / Habibi | one line each on 2026-10-03 (docs/evidence/voice-design/report.json): IndexTTS card total 3.5 → 9.5 GB while loaded (≈ 6 GB), 15.8 s for load + a 5.7 s line; Habibi IRQ 3.5 → 4.3 GB after one 3.3 s line, 18.8 s with a 17 s load. Not yet a full measurement | 1 (unloads on request) |
| VoxCPM2 (voice design, bf16, eager) | 5.2 GB allocated / 6.4 GB reserved peak (≈ 7 GB of the card with its CUDA context); 18 s load (33 s cold); 3.3–7.2 s per candidate of 6.6–15 s audio; ≈ 0.63 GB context stays after `/unload` until restart | 1 (unloads on request) |
| ECAPA (speaker embeddings) | CPU only: ~8 s first load, ~0.2 s per pair of 10 s clips | — |
| faster-whisper large-v3 fp16 | ~3.7 GB; 6 s of speech in 1.2 s warm, 8.9 s with the first load | 1 |
| Demucs htdemucs | ~2.3 GB; 1.5 s clip in ~1 s warm, 27 s with the first download + load | 1 |
| ACE-Step 1.5 XL turbo | 34 s of engine time for a 90 s song (8 steps); plus ~30 s of Demucs for the stems | 1 |
| qwen3:14b (Ollama, Q4) | 10 GB, 100% GPU even beside ComfyUI's staged H3; ~17 s median per structured answer; unloads after 2 min idle | 1 |

`GPU_VRAM_BUDGET_MB` (default 30000) is the worker's ceiling; the GPU lease serialises families and records waits.

## Changing a model

1. Add the file to the manifest with repository, path, folder, size and SHA-256 (from the Hugging Face LFS listing:
   `https://huggingface.co/api/models/<repo>/tree/main?recursive=true` gives `lfs.oid`, which is the sha256).
2. Run `docker compose --profile models run --rm models` (or the one-off `curl` container above for a small file).
3. If a workflow changes, bump nothing by hand: `src/server/workflows` hashes each template, and every take records the
   hash it was generated with.
