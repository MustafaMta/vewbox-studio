# Models

Every model the studio uses, where it runs, why it was chosen, and what it costs on the RTX 5090 (32 GB). Weights are
pinned by repository, file name and SHA-256 in `docker/models/manifest.json` and fetched into the model store by
the `models` service; the voice services fetch their own weights on first boot into the same store. **Where the weights
live:** one ext4 VHDX on D: (`D:\models\vewbox-models.vhdx`, mounted in every container at `/models`), described in
[MODELS-STORAGE.md](MODELS-STORAGE.md). Paths below are logical (`diffusion_models/…`, as the manifest names them);
inside the store ComfyUI's typed folders sit under `comfyui/` and the caches under `cache/` (`docker/models/layout.json`).

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
| The canonical character image from text; plates from nothing | Qwen-Image-2512 | `qwen_image_2512_fp8_e4m3fn` (20.4 GB), `qwen_2.5_vl_7b_fp8_scaled` encoder (9.4 GB), `qwen_image_vae`; Lightning 8-step LoRA for drafts and plates | Apache-2.0 |
| The canonical image from the producer's picture (Image Reference) — **non-default since 2026-10-06** (production stack directive: Qwen-Image-Edit-2511 takes the role; `CANONICAL_REFERENCE_ENGINE=klein` only) | FLUX.2 [klein] 4B distilled (4 steps, cfg 1; docs/research/FLUX-VS-QWEN.md) | `diffusion_models/flux-2-klein-4b.safetensors` (7 751 105 712 B, sha256 `ec3d4e73…a343`), `text_encoders/qwen_3_4b.safetensors` (8 044 982 048 B, `6c671498…c5a`), `vae/flux2-vae.safetensors` (336 211 292 B, `868fe7b3…8f3`); Comfy-Org/flux2-klein-4B rev `5f526678`, group `images-flux2-klein` (no longer in the default `MODEL_GROUPS`; to be removed after the UI-proven Qwen route) | Apache-2.0 |
| Location views, storyboard frames (edit from up to 3 references); optional secondary material (one reference: the canonical image); **the canonical image from the producer's picture (Image Reference), the default since 2026-10-06** | Qwen-Image-Edit-2511 | `qwen_image_edit_2511_fp8mixed` (20.5 GB), same encoder/VAE, Lightning 4-step LoRA (849 608 296 B, sha256 `22226e8d…904f`) | Apache-2.0 |
| Reading the producer's picture (Image Reference): the description the identity line is written from | Qwen3.5-4B in core `TextGenerate` (`CLIPLoader` → `TextGenerate`, greedy) | `text_encoders/qwen3.5_4b_bf16.safetensors` (9 319 828 320 B, sha256 `9fb3ae42…0841`, Comfy-Org/Qwen3.5 rev `5d50a225`), group `images-vlm` | Apache-2.0 |
| Face box of the producer's picture (the face crop given to the redraw; upload validation) | MediaPipe BlazeFace + Face Landmarker (Comfy-Org/mediapipe), core `MediaPipeFaceLandmarker` | `detection/mediapipe_face_fp32.safetensors` (5.4 MB) | Apache-2.0 |

Three visual directions (Cartoon, Anime, Realistic) are prompt languages on the same models (`src/server/story/style.ts`),
so a character keeps one identity across productions and directions are genuinely different in design, lighting and camera.

### The canonical character image (`src/server/workflows/canonical-image.ts`, `src/worker/handlers/images.ts`)

Contract: `docs/CONTRACTS-IDENTITY-PACK.md` (v2) — one character = ONE canonical front full-body image + one voice.
Evidence, A/B and per-image notes: `docs/evidence/image-v2/REPORT.md`.

| Mode | Graph (registry template) | Settings | Inputs | Measured (RTX 5090) |
|---|---|---|---|---|
| Auto / Manual | `qwen-image.canonical` (`qwenCanonicalImage`) | **quality**: no Lightning, 30 steps, cfg 4, euler/simple, shift 3.1, negative with the style's "not this medium" words | the prompt: medium first → whole-figure framing → English identity line → style direction → avoid list | 928×1664; 42 s engine warm (≈ 6–9 s with the Lightning draft `qwen-image.canonical-draft`) |
| Image Reference — read | `qwen3.5.reference-read` (`referenceReadGraph`) | MediaPipe (`detector_variant` both, min confidence 0.5) + Qwen3.5-4B (sampling off, thinking off, ≤ 900 tokens) in one prompt; once per picture: a creation from a picture reads it before the design (D15: the design gets the apparent age, sex and visible clothing), the reading is stored on the picture (`provenance.reading`) and the redraw uses it | the validated upload | see REPORT §4 |
| Image Reference — klein (non-default, ``CANONICAL_REFERENCE_ENGINE=klein``) | `flux2-klein.canonical-reference` (`kleinReferenceCanonical` + `kleinReferencePrompt`) | FLUX.2 [klein] 4B distilled: 4 steps, cfg 1, zeroed negative, `Flux2Scheduler`, euler; the prompt names only what the person has (no generic "glasses, facial hair" list: klein reads words literally) and no negations | the upload (≈1 MP) → `ReferenceLatent`, then its face (one detected face → square crop with 25 % margin, chin-safe, cut in the graph, 1024²) chained after it; the retry leaves the face out | 3.7 s / 2.5 s engine (face / upload only), card ≈ 22 GB (FLUX-VS-QWEN.md §5) |
| Image Reference — redraw (default) | `qwen-image.canonical-reference` (`qwenReferenceCanonical` + `referenceCanonicalPrompt`) | Edit-2511 **quality**: 24 steps, cfg 4, the style's negative | image1 = the upload (≈1 MP), image2 = its face (cut in the graph, 1024²); the retry after a framing failure leaves the face out | 101–120 s engine, card 30.4 GB; whole figure 7/10 first attempts in MODEL-EVAL §2.6 (17/24 in the earlier A/B) — the framing retry covers the rest |

- **Identity line** (`canonicalIdentityLine`, or `identityLineFromDescription` for a picture): English, style first, then
  sex and age ("a man of about 70"), build, face, hair, eyes, skin, every garment with its colour, distinguishing details,
  accessories, restrictions. A piece in another script is left out and reported (`nonLatin`), never sent to the model; a
  look written only in another script is refused with a reason. Recorded on the canonical image (`identityLine`).
- **Framing check** (`src/server/media/figure-check.ts`, CPU): the background is flooded from the border; the figure's box
  must keep clear of the top and bottom edges and fill ≥ 55 % of the height. A failing picture is redrawn once with the
  next seed (the first stays in the library as RAW), then left for the producer with the reason (approval then needs
  an override). On the A/B set it passed 36/36 canonical pictures and failed 12/12 deliberately cut ones.
- **Seed**: the character's identity seed (`identitySeedFor`) + the version it replaces, so a redraw is a new picture.
- Provenance on every asset: model, prompt, negative, seed, references, workflow version, ComfyUI prompt id, engine time,
  the framing result; from a picture also the face box, the description and the reading model. `setCanonicalImage`
  records job, seed, reference, engine, identity line and check; the image is a DRAFT until the producer approves it.
- **Secondary material** (`CHARACTER_REFS`, template `qwen-image.secondary`): only on request, one Qwen-Image-Edit-2511
  pass per kind in quality mode (24 steps, cfg 4, the style's negative) with the canonical image as the only reference
  and its identity line — an expression sheet (1280×1280, 2×2 grid), the outfit (928×1664, the whole figure) or a
  close-up portrait (1024×1280) — stored with tier `SECONDARY`, never the identity. The wave-2 identity sheet, the
  derived FRONT/THREE-QUARTER/SIDE/BACK views and the Multiple-Angles LoRA were removed on 2026-10-03 (audit C1): one
  click drew a four-view sheet first and saved seven assets.

#### The detection folder (corrected 2026-10-03)

ComfyUI only reads the folders listed in `docker/comfyui/extra_model_paths.yaml`; `detection` (and `clip_vision`,
`controlnet`, `style_models`, `background_removal`) were missing, so `LoadMediaPipeFaceLandmarker` listed nothing although
`/models/detection/mediapipe_face_fp32.safetensors` existed. The earlier note here ("a cache that refreshes on the next
start") was wrong: a restart alone does not fix it. The yaml now lists them and `compose.yaml` bind-mounts it from the
repo, so a new model folder needs a `comfyui` restart, not an image rebuild. On 2026-10-03 the corrected file was copied
into the running container and `comfyui` alone was restarted (queue empty, no image job active); `/models/detection`
then listed the MediaPipe file and `/object_info/LoadMediaPipeFaceLandmarker` offered it. After this branch is merged,
`docker compose up -d --no-deps comfyui` (from the main checkout) makes the bind mount effective.

#### Downloaded but not wired (left on the models volume)

Fetched on 2026-10-03 for an identity-similarity check across views; with one canonical image there is nothing to
compare, so they are **not used**, no Node dependency (onnxruntime-node) was added, and their manifest group was
removed. (The YuNet and SFace files are used again since 2026-10-05: see below. Do not delete the folder.)

| File (volume path) | Bytes | sha256 | Licence |
|---|---|---|---|
| `identity/face_detection_yunet_2023mar.onnx` (opencv/face_detection_yunet) | 232 589 | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT |
| `identity/face_recognition_sface_2021dec.onnx` (opencv/face_recognition_sface) | 38 696 353 | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | Apache-2.0 |
| `identity/dinov2-small/model.onnx` (Xenova/dinov2-small) | 88 459 888 | `83141175ec78b4ff9a2bb58a4c7c264ba0054d1c2e122e5a8114b79a8d4179ea` | Apache-2.0 |
| `identity/ccip/model_feat.onnx`, `model_metrics.onnx`, `metrics.json` (deepghs/ccip_onnx, caformer-24-randaug-pruned) | 150 248 245 + 1 649 + 147 | `4ea118d1…ac5f`, `7e4646fd…25c1`, `b5535577…52d4` | **OpenRAIL** — use restrictions travel with the model (no unlawful, discriminatory, defamatory or privacy-violating use, among others); any future use must pass them on |
| `loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` (lightx2v, rev `d74eba14`) | 849 608 296 | `a9e81a58a78f260f67b337a6f615e8fa4cd3bc79847c77b7d61a581b789b1ba8` | Apache-2.0 (a "balanced" mode for the old sheet; unused) |
| `diffusion_models/flux-2-klein-base-4b.safetensors` (Comfy-Org/flux2-klein-4B) | 7 751 105 712 | `9c5fed22b76baea749d88fc2abe3ad53245e7b21a0d353a762665eea00043b92` | Apache-2.0 (klein Base, evaluated and not chosen: 20× slower, worse likeness; out of the manifest since the klein group became `images-flux2-klein`; `rm /models/comfyui/diffusion_models/flux-2-klein-base-4b.safetensors` in the store frees 7.75 GB) |
| `loras/qwen-image-edit-2511-multiple-angles-lora.safetensors` (fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) | 295 140 688 | `42426ded4e25fd22879d9e198b857556445ef4ca56e8da3246d0345155bb6765` | Apache-2.0 (camera LoRA of the removed derived views; out of the manifest since 2026-10-03; `rm /models/comfyui/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors`) |

Since 2026-10-05 the YuNet and SFace files above are used again, by the face-identity QA of the `asr` service
(manifest group `qa-identity`, same folder and sha256; see "Alignment and picture QA" below). Do not delete them.

## Voices and transcription

| Purpose | Engine | Where | Licence | Notes |
|---|---|---|---|---|
| English and Arabic voices with cloning from a short recording | IndexTTS 2.5 (`IndexTeam/IndexTTS-2.5@c39ce5b`) | `tts` service (python 3.11, torch 2.8 cu128) | **bilibili Model Use License Agreement** (the repo's `LICENSE`, read 2026-10-06): commercial use OK, royalty-free, no registration — a separate licence is needed only above 100 M monthly active users or RMB 1 bn annual revenue (§2.2). Conditions: keep the copyright notices and a copy of the agreement with every copy we distribute (§3.4b) and bind downstream recipients (§3.4a); **§3.4c: the model and its outputs must not be used to improve any other AI model** (no IndexTTS output as training/fine-tuning data for another commercial model); disclaimer text on any distributed derivative (§4.1a); revocable on breach; PRC law, the Chinese text prevails | emotion control; `use_cuda_kernel=False` on Blackwell |
| Iraqi Arabic voices | Habibi-TTS IRQ (F5-TTS based; `SWivid/Habibi-TTS@3ad11a1`, `Specialized/IRQ/model_100000`) | `tts-habibi` service | **Apache-2.0 per licensor; data-provenance risk (F5-TTS init on Emilia, CC-BY-NC); legal review before commercial release.** The card's note and the GitHub README license ALG/EGY/IRQ/MAR/MSA as Apache-2.0 (Unified, SAU, UAE: CC-BY-NC-SA-4.0; the repo-level tag says cc-by-nc-sa-4.0); the paper (arXiv 2601.13802) initialises every model from F5-TTS, whose weights are CC-BY-NC "due to the training data Emilia" | dialect-specialised; chosen automatically for `IRAQI_BAGHDADI`. A clean commercial Iraqi engine is a priority of the Iraqi phase (dots.tts / MOSS-TTS / VoxCPM2 arms in `docs/voice/IRAQI-ENGINE-COMPARISON-2026-10.md`) |
| English voices — the production candidate (PRODUCTION-STACK-DIRECTIVE 2026-10-06) | **MOSS-TTS v1.5** (`OpenMOSS-Team/MOSS-TTS-v1.5@cdd3b91`, 8 B MossTTSDelay on Qwen3-8B, bf16) + `MOSS-Audio-Tokenizer@3cd226b` (24 kHz, 32 codebooks, 12.5 frames/s) | `tts-moss` service (:8023, compose profile `moss`; docker/tts-bench target `moss`: python 3.12, torch 2.9.1 cu128, transformers 5.0.0) | **Apache-2.0** (HF card; the Python modelling code is pinned by revision and loaded with `trust_remote_code`) | manifest group `eval-voice-moss` (22.4 GB, store folders `tts/bench/moss-tts-v1.5`, `tts/bench/moss-audio-tokenizer`). Zero-shot cloning from ONE reference clip (no transcript); token-level duration control (`duration` seconds → `tokens` = s × 12.5); `[pause X.Ys]`; no emotion input (delivery from the reference). Selected for NEW English voices by `VOICE_ENGINE_EN=moss` (src/server/providers/voice-engines.ts) only after the real-UI proof; pinned voices keep their engine. Measured on the bench: ≈ 20 GB of the card loaded. Candidate record: docs/research/VOICE-BENCH-2026-10.md |
| Transcript check and subtitle timing | faster-whisper large-v3 (CTranslate2 fp16) | `asr` service | MIT | every generated line is transcribed back and compared with the script (word error rate recorded on the asset) |
| Arabic transcription (`language=ar`), staged for the model phase's tests | whisper-large-v3-arabic-dialectal-v2 (oddadmix, `@540fc225`; `model.safetensors` 6 174 112 552 B `a4876ef7…5ac6`), converted to CTranslate2 fp16 | `asr` service, `ASR_MODEL_DIR_AR` (`/models/asr/whisper-large-v3-arabic-dialectal-v2-ct2`) | Apache-2.0 | fetch group `stack-2026-10` (`MODEL_GROUPS=stack-2026-10`), then `docker compose --profile models run --rm asr-convert`. One Whisper model on the card at a time; until the ct2 folder exists Arabic stays on large-v3. Card WER 0.254 / CER 0.068 on its own 200 Iraqi clips (docs/research/MODEL-STACK-2026-10.md §7.2) |
| Hosted speech (optional) | MiniMax `speech-2.8-hd` | API | MiniMax terms | only when the character's voice identity selects it and a key exists |
| Voice design: a synthetic voice from a text description (EN, AR-MSA; no audio input) | VoxCPM2 (OpenBMB, 2 B), `voxcpm==2.0.3` | `tts-design` service (:8022) | **Apache-2.0** (weights and code; the card asks that AI audio be labelled and forbids impersonation) | `openbmb/VoxCPM2@32279ef`: `model.safetensors` 4 580 080 592 B `f7f964cf…891d`, `audiovae.pth` 376 951 122 B `94b5d51e…4bf1` (a PyTorch pickle: loaded only inside the container, `weights_only=True`), tokenizer + config. 48 kHz output; the 24 kHz mono copy is the line engines' reference. No dialect control: Iraqi is never designed (VOICE-IDENTITY-V2 §3.2) |
| Speaker similarity (seed↔seed, line↔reference, cast distinctness) | ECAPA-TDNN, SpeechBrain `spkrec-ecapa-voxceleb`, `speechbrain==1.1.1` | `tts-design` service, CPU | Apache-2.0 | `@0f99f2d`: `embedding_model.ckpt` 83 316 686 B `0575cb64…26a2` + hyperparams, norm, classifier, label encoder (89 MB). 192-d, L2-normalised. VoxCeleb-trained: a relative measure, never an identity or dialect proof |

#### Fetching the voice-design weights (group `voice-design`)

The group is in the compose `MODEL_GROUPS` default, so a fresh `docker compose --profile models run --rm models` fetches
it. The `models` service mounts the repository's fetch.py, manifest.json and layout.json, so no image rebuild is needed
after a manifest change (resumable; every file is sha256-verified and recorded in `/models/.manifest-state.json`; the
fetcher refuses a root without the store's `.vewbox-models` marker):

```powershell
docker compose -p vewbox --profile models run -d --name vewbox-models-fetch-voice models --manifest manifest.json --root /models --groups voice-design
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
- Iraqi A/B (`scripts/iraqi-ab.ts` → `docs/evidence/voice-design/iraqi-ab/results.json`, `results-h8.json`,
  `listen-sheet.csv`): 8 designed seeds (MSA wording vs Baghdadi wording + Baghdadi-accent description, 2 voices × 2
  seeds) × 4 Iraqi lines × 2 Habibi seeds. The Baghdadi seed text did not measurably help (pooled CER 0.052 vs 0.056,
  PASS 12 vs 12 of 32; the sign flips between Habibi seeds); the individual seed mattered more (best
  `iraqi-male-c1-s5002`: CER 0.016, 6/2/0). «الچاي» and «باچر» never came back with a /tʃ/ letter (0 of 36, also with
  Habibi's own real Iraqi demo clip as reference) — a listener question, not settled by ASR. Space-insensitive view:
  `src/server/media/arabic-align.ts` (6 of 72 lines were REVIEW only because «گلتلك» was written «قلت لك»).

## Alignment and picture QA (`asr` service)

Research and decisions: `docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md` §B, §C.2 (Tier 1), §D. Client and judges:
`src/server/providers/qa-service.ts` (`alignScript`, `mouthActivity`, `faceIdentity`; `judgeAlignment`, `judgeLipSync`,
`judgeIdentity`). Every threshold is a **START** value; none has been calibrated on H3 output yet.

| Purpose | Model | Where | Licence | Notes |
|---|---|---|---|---|
| Word/character times of the KNOWN script text (dialogue windows, subtitles, lip-sync windows) | `facebook/wav2vec2-base-960h` (EN) | `asr` `POST /align` (`docker/asr/align.py`), CUDA when available, else CPU | Apache-2.0 **◐** (card not read: Hugging Face was blocked in the cloud session; confirm before the first fetch) | group `qa-align` → `/models/align/wav2vec2-base-960h` (`ALIGN_MODEL_DIR_EN`). WhisperX's CTC trellis/backtrack re-implemented in numpy (BSD-2 notice in `align.py`; the whisperx package is not installed). 30 s emission windows; ≤ 180 s per call (`ALIGN_MAX_AUDIO_S`). Score floor START 0.30 |
| The same for Arabic | `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` (AR) | `asr` `POST /align` | Apache-2.0 **◐** (as above) | group `qa-align` → `/models/align/wav2vec2-large-xlsr-53-arabic` (`ALIGN_MODEL_DIR_AR`). The vocabulary is read at load: Arabic letters are used directly, a Buckwalter vocabulary gets a transliteration. Diacritics and tatweel are stripped; digits in Arabic lines are not spelled (those words are timed from their neighbours) |
| Mouth activity per face track against the speech of the audio that plays in the cut (Tier-1 lip-sync; extra singers) | MediaPipe Face Landmarker `face_landmarker.task` (float16/1, 3 758 596 B, sha256 `64184e22…c9ff`) | `asr` `POST /qa/mouth` (`docker/asr/qa.py`), CPU | Apache-2.0 (MediaPipe ✔; the model card's terms ◐) | Not on Hugging Face: recorded under `service_fetched` in the manifest; the service downloads it once into `/models/qa/` and checks the sha256 (`QA_AUTOFETCH=0` disables; then `docker run --rm -v vewbox_models:/models curlimages/curl -L -o /models/qa/face_landmarker.task <url>` and check the sha256). Needs `libegl1`/`libgles2` in the image even on CPU |
| Face identity of each character against its canonical image | OpenCV Zoo YuNet 2023mar + SFace 2021dec (`cv2.FaceDetectorYN`, `cv2.FaceRecognizerSF`) | `asr` `POST /qa/identity`, CPU | MIT ✔ (YuNet) / Apache-2.0 ✔ (SFace) | group `qa-identity` → `/models/identity/` (the files already on the volume). SFace cosine per sampled frame (default 2 fps), faces assigned one-to-one to characters; START fail < 0.363, review < 0.50, drift review > 0.15. Realistic faces only; advisory on stylised faces |
| Lip-sync Tier 2 (LSE-C/LSE-D, AV offset) | SyncNet (`joonson/syncnet_python`) | interface only (`qa.syncnet_check`) | code MIT; **weights: no stated licence** | disabled; answers `{available: false}` unless `SYNCNET_DIR` exists, and even then no runner is wired until the licence is confirmed (internal QA only) |

Not usable (licence): MMS forced-alignment weights and ctc-forced-aligner's default model (CC-BY-NC), InsightFace model
packs (non-commercial), Wav2Lip, Diff2Lip.

Packages added to the `asr` image (PyPI, 2026-10-05): `transformers==5.18.0`, `opencv-python-headless==4.14.0.94`,
`mediapipe==1.0.1` (installed `--no-deps`: it declares the GUI `opencv-contrib-python`), `numpy==2.5.3`, and what
MediaPipe's vision tasks import (`absl-py`, `flatbuffers`, `matplotlib`, `certifi`). `/health` → `capabilities` says, per
capability, whether it can run and why not; a missing module or weight never stops transcription or separation.

VRAM/CPU cost: **not measured** (no GPU in the session that built this). The QA endpoints are CPU-only by design so they
can run beside H3; `/align` uses the card when one is visible (`ALIGN_DEVICE=cpu` forces CPU) and is dropped by `/unload`.

## Lip-sync corrector (`lipsync` service, opt-in)

Directive 2026-10-06 §16; research `docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md` §C.3. Native MiniMax H3
performance is the default; the corrector runs only for ONE take the producer confirmed after a failed lip-sync review
(job `CORRECT_LIPSYNC`, `src/worker/handlers/lipsync.ts`; rules and thresholds as data in
`src/domain/lipsync-correction.ts`). It redraws the mouth region of the existing take to the authoritative audio and
records the result as a NEW take (`derivedFrom`) beside the original, accepted or rejected with before/after numbers.
It never generates video. Compose: `docker compose --profile lipsync up -d lipsync` (host port 8045, container 8040, no VRAM while idle,
weights dropped after every request unless `LIPSYNC_KEEP_LOADED=1`). GPU family `LIPSYNC`: ComfyUI (H3) and every other
engine unload before it loads.

| Part | What | Licence (read at the primary source, 2026-10-06) | Where |
|---|---|---|---|
| LatentSync code | github `bytedance/LatentSync` @ `a229c39` (1.6, 2025-06-20), fetched by the image build | Apache-2.0 ✔ (LICENSE) | `/opt/latentsync` in the image |
| LatentSync 1.6 U-Net | `ByteDance/LatentSync-1.6` rev `c42c7e6c…`, `latentsync_unet.pt` 5 072 222 488 B | **CreativeML Open RAIL++-M** ✔ (model card `license: openrail++`; the research note's "Apache-2.0 ◐" was wrong). Commercial use allowed, royalty-free; the Attachment A use restrictions (no unlawful use, defamation or harassment, false information to harm, PII for harm, discrimination, exploitation of minors, medical advice, law-enforcement profiling…) bind the studio and **must be passed downstream in any Vewbox terms of use**, with a copy of the licence; the licensor claims no rights in outputs. Re-lipping the studio's own fictional characters is within it | group `lipsync-latentsync-1.6` → `/models/lipsync/latentsync-1.6/` |
| Whisper tiny (audio features) | `whisper/tiny.pt` from the same repo, 75 572 083 B, sha256 `65147644…22b9` — byte-identical to OpenAI's release (its download URL carries this hash) | MIT ✔ (openai/whisper LICENSE, © 2022 OpenAI) | same group → `.../whisper/` |
| VAE | `stabilityai/sd-vae-ft-mse` rev `31f26fde…`, safetensors 334 643 276 B | MIT ✔ (card) | same group → `/models/lipsync/sd-vae-ft-mse/` |
| Face detection / choice | YuNet 2023mar + SFace 2021dec | MIT ✔ / Apache-2.0 ✔ | group `qa-identity` (shared with asr) |
| Face landmarks (alignment) | MediaPipe Face Landmarker `face_landmarker.task` | Apache-2.0 | `/models/qa/` (fetched by the asr service) |
| Evaluation only | `stable_syncnet.pt` (1.6 GB) | OpenRAIL++-M | group `lipsync-eval-syncnet`; not used by the pipeline |

**Not used:** InsightFace (`buffalo_l`, used by upstream 1.6 for detection + 106 landmarks — non-commercial packs; the
package is not installed and `latentsync/utils/face_detector.py` is replaced by a stub), the repo's `auxiliary/` files
(`sfd_face.pth`, `syncnet_v2.model`, VGG16, I3D, KonIQ, ViT-g: unstated or third-party licences), `face-alignment`,
`decord` (no Python 3.12 wheel; a stub), DeepCache, gradio. MuseTalk 1.5 stays parked (its BiSeNet / DWPose weights have
no stated licence).

**How the Vewbox build differs from upstream inference** (`docker/lipsync/corrector.py`, `face_track.py`):
- faces: YuNet boxes → the speaker chosen by SFace against the speaker's canonical image AND against the other cast
  members (a face is the speaker only if it resembles the speaker more than every other character — measured on the
  acceptance two-shot, where the listener scored 0.3+ against the speaker's picture while the speaker was in profile);
  MediaPipe's 478-point mesh on a crop → LatentSync 1.5's own 478→68 table → the three alignment points (eyebrow centres,
  nose), smoothed with 1.5's `laplacianSmooth`; the 1.6 Procrustes transform ported to numpy;
- native frame rate (H3: 24 fps; upstream re-encodes to 25), same frame count, the take's own audio copied;
- only the regenerated region (mask.png's lower face, eroded and feathered) is blended into the ORIGINAL frame:
  eyes, brows, hair, the other characters and the background are bit-identical before encoding;
- profile frames are not edited: head yaw from the Face Landmarker's transformation matrix, full strength up to 30°, none from 42° (frontal shots measured −23…+8°, 3/4 views 20–35°, near-profiles 30–70° — corrected near-profiles lost their smile); the edit fades in/out over 4 frames;
- occlusion gate: frames where a hand (MediaPipe Hand Landmarker; a held cup sits inside its outline) covers ≥ 4 % of the regenerated region, or the original lower face / the model's change is an outlier against the clip's own median, are left uncorrected (±2 frames, faded) — calibrated on the acceptance takes' tea sips.

**Measured on the RTX 5090** (2026-10-06, H3 unloaded by the LIPSYNC lease): load 46 s; VRAM peak 11.0 GB allocated /
16.9 GB reserved; ≈ 0.5 s of model time per frame at 1344×768 (a 9.4 s take: 117 s; 5.2 s: 61 s) plus ≈ 5 s tracking
and 3–6 s compositing/encoding; frame count exact on every take (226/226, 192/192, 158/158, 124/124).

**Evaluation on the acceptance production "Tea at Mutanabbi" (CARTOON, 11 H3 speaking takes, v1 = gates without the
yaw rule)** — evidence `var/evidence/lipsync-v1/` (media outside Git): `original/` and `v1/` (asr Tier-1 mouth check
and SFace), `out/v1/<take>.mp4|.json|<take>/` (corrected takes, reports, frame sheets), `look/v1/` (before/after zooms),
`compare-v1.json`.
- Identity kept: SFace to the canonical image 0.586–0.732 before → 0.604–0.720 after (|Δ| ≤ 0.02 on frontal and 3/4
  takes); against a frame of the original take 0.649–0.901 → 0.649–0.900. No seam visible at 1344×768; eyes, brows,
  hair and the background are untouched by construction.
- Mouth follows the authoritative line better where H3 was off: Tier-1 correlation 0.09 → 0.73 (take 07d2, H3 kept
  talking after the line), 0.36 → 0.71 (66df), 0.26 → 0.75 (d1a8); talking-in-silence takes −0.52…−0.29 → −0.41…−0.08
  (mostly occluded by the cup, so few frames corrected). Already-good take (shot 2): 0.63 → 0.60 — no gain.
- **Expression and performance are NOT kept on cartoon faces**: the regenerated lower face is driven by the audio, so
  the stylised performance is flattened — mouth activity while speaking −17…−35 % on every corrected take, wide cartoon
  grins in pauses become closed-mouth smiles (take d1a8 frames 90–100), wide open vowels become smaller "realistic"
  mouths (take e983). Near-profile frames lost the smile and smudged (shot 1) — fixed by the yaw gate.
- Occlusion: the tea sips (hand + glass over the mouth) were left untouched by the gate (takes 07d2, 66df, e983);
  a sip DURING the line (07d2, "lip-sync over a sip") remains — a staging defect the corrector cannot fix.
- **Verdict CARTOON: no-go** (the producer's rule: no change of expression). The capability keeps `styles: ['REALISTIC']`
  only, and the acceptance check `performance-kept` (activity while speaking may drop ≤ 20 %) rejects a flattened
  correction on any style.
- **ANIME (v2, yaw gate; 4 older H3 anime faces 203–357 px, driven with a recorded English line): no-go.** Identity
  held (self-identity 0.78–0.87 → 0.77–0.87) but the regenerated mouth is drawn as a soft, shaded "real" mouth: the
  ink line-art of the lips is lost, an open inked mouth becomes pale flat lips, and one frame shows a dark red blob
  mouth (`look/v2/anime-06cfa1-zoom.jpg` f37, f78; `anime-2ac9b4-zoom.jpg`). The Tier-1 mouth check also loses most
  anime mouths, so the acceptance cannot even measure them reliably.
- **SINGING (v2): no-go.** Shot-2 Abu Haidar (frontal, 254 px) driven by 9.5 s of a Demucs lead-vocal stem
  (`sing-vocals-10s.wav`, from a backup song): sustained sung vowels produce small, barely changing mouths (Tier-1
  correlation with the vocal 0.28 → 0.21, activity ratio 1.36 → 1.12); LatentSync's Whisper-tiny audio features are
  speech-trained. Music videos keep native H3 performance + the measured offset trim + the extra-singer check; the
  capability keeps `singing: false`. (The corrector never touches a face other than the assigned one, so it cannot make
  a background character stop singing either.)
- Load proof from the D: model store (`out/v2/_load-proof.json`): `/models` = the store's ext4 bind (`/dev/sdd /models
  ext4 ro`), unet / whisper / VAE / YuNet / SFace / both landmarkers read from `/models/lipsync`, `/identity`, `/qa`;
  load 42 s.
- REALISTIC: pending the acceptance engineer's realistic speaking takes.

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
| OpenAI-compatible (bundled `llm` service, `ollama/ollama:0.35.1`) | **`gemma4:31b-it-qat`** on the 5090 (default since 2026-10-05: Iraqi dialogue and staged shot plans clearly better than qwen3:14b in the controlled test, docs/research/MODEL-EVAL-2026-10.md §3); `qwen3:14b` kept selectable (`OPENAI_COMPATIBLE_MODEL=qwen3:14b`: 2.5–3× faster, half the card, MSA-leaning Arabic) | `auto` with no hosted key; works offline. Flash attention, q8_0 KV cache, `OLLAMA_CONTEXT_LENGTH=16384` (docs/research/MODEL-STACK-2026-10.md §7.1) |

All three return JSON validated against strict schemas with tolerant parsing (`src/server/story/lenient.ts`) and a
repair round; Arabic productions are written in dialect (Iraqi Baghdadi by default) with an English gloss.

## VRAM plan (32 GB)

| Family | Measured on the RTX 5090 | Concurrency |
|---|---|---|
| MiniMax H3 fl2va int8 + nvfp4 encoder | 22–32 GB card total while generating (DiT staged dynamically, 20 GB); 60–95 s per 3.75–5.9 s clip at 1344×768, 8 turbo steps ≈ 7 s each | 1 (ComfyUI serialises) |
| Qwen-Image-Edit fp8 + encoder fp8 (Lightning) | engine time from `/history`: T2I 8 steps 1024×1280 11.5 s warm (75 s with the first load); Edit 4 steps, 1 reference, 1024×1280 18–22 s; 3 references 1344×768 12–13.5 s; VRAM peak not yet recorded | 1 |
| Qwen-Image-2512 fp8, quality mode (the canonical image: 30 steps, cfg 4, 928×1664) | 42 s engine warm (41.8–42.2 s over 12 runs); Lightning 8-step draft at the same size 6–9 s; card total sampled at 1 Hz 29.6–31.7 GB while ComfyUI kept both Qwen models and the encoder resident (voice/ASR unloaded) | 1 |
| FLUX.2 [klein] 4B bf16 + Qwen3-4B encoder (Image Reference redraw: 4 steps, cfg 1, 928×1664, 1–2 reference latents) | 3.7 s with the face crop, 2.5 s without, ≈ 11 s cold; card ≈ 22 GB (FLUX-VS-QWEN.md §5); the confirmation's own times are in docs/evidence/flux-vs-qwen/confirmation | 1 |
| Qwen-Image-Edit fp8, quality mode (secondary material: 24 steps, cfg 4, 1 reference) | expression sheet 1280² 80.4 s, outfit 928×1664 67.3 s, close-up 1024×1280 60.1–70.8 s engine; card ≤ 31.9 GB (docs/evidence/image-v2/d13, 2026-10-03). The removed path drew a 3-view sheet first (140–141 s) and then the view | 1 |
| IndexTTS 2.5 / Habibi | one line each on 2026-10-03 (docs/evidence/voice-design/report.json): IndexTTS card total 3.5 → 9.5 GB while loaded (≈ 6 GB), 15.8 s for load + a 5.7 s line; Habibi IRQ 3.5 → 4.3 GB after one 3.3 s line, 18.8 s with a 17 s load. Not yet a full measurement | 1 (unloads on request) |
| VoxCPM2 (voice design, bf16, eager) | 5.2 GB allocated / 6.4 GB reserved peak (≈ 7 GB of the card with its CUDA context); 18 s load (33 s cold); 3.3–7.2 s per candidate of 6.6–15 s audio; ≈ 0.63 GB context stays after `/unload` until restart | 1 (unloads on request) |
| ECAPA (speaker embeddings) | CPU only: ~8 s first load, ~0.2 s per pair of 10 s clips | — |
| faster-whisper large-v3 fp16 | ~3.7 GB; 6 s of speech in 1.2 s warm, 8.9 s with the first load | 1 |
| Demucs htdemucs | ~2.3 GB; 1.5 s clip in ~1 s warm, 27 s with the first download + load | 1 |
| ACE-Step 1.5 XL turbo | 34 s of engine time for a 90 s song (8 steps); plus ~30 s of Demucs for the stems | 1 |
| gemma4:31b-it-qat (Ollama, Q4_0 QAT, 16K q8_0) | 19.1 GB loaded, 100 % GPU; card peak 21.4 GB; `llm` container ≤ 11.9 GB RAM; script 42–52 s, one scene's shot plan 102–125 s, develop 32 s warm / 134 s cold (MODEL-EVAL-2026-10 §3); lease estimate 21500 | 1 |
| qwen3:14b (Ollama, Q4_K_M) | 10.6 GB loaded, card peak 11.5 GB; script 11–17 s, shot plan 37–76 s (MODEL-EVAL-2026-10 §3); unloads after 2 min idle; lease estimate 12000 | 1 |

`GPU_VRAM_BUDGET_MB` (default 30000) is the worker's ceiling; the GPU lease serialises families and records waits.

## Changing a model

1. Add the file to the manifest with repository, path, folder, size and SHA-256 (from the Hugging Face LFS listing:
   `https://huggingface.co/api/models/<repo>/tree/main?recursive=true` gives `lfs.oid`, which is the sha256).
2. Run `docker compose --profile models run --rm models` (or the one-off `curl` container above for a small file).
3. If a workflow changes, bump nothing by hand: `src/server/workflows` hashes each template, and every take records the
   hash it was generated with.
