# Character image V2 — canonical references for Auto / Manual / Image-Reference, three styles (research, 2026-10-03)

Scope: choose the strongest practical image-generation and reference-conditioning workflow for the RTX 5090 (32 GB)
under ComfyUI 0.38.1, for the three creation methods (Auto, Manual, Image Reference) and the three directions
(Cartoon, Anime, Realistic); define the canonical reference pack, the automatic identity check, the REFERENCE-mode
description step, the GPU A/B plan for acceptance, and the downloads that need the user's go-ahead.
Method: read-only. ComfyUI was queried over HTTP (`/system_stats`, `/object_info`, `/models/*`, `/history`, `/queue`);
ComfyUI's own source and safetensors headers were read inside the running container (no writes); the pictures of the
last two wave-2 packs were examined from the Phase-0 backup. **No prompt was queued, nothing was downloaded, nothing
restarted, no code changed.** Builds on `CHARACTER-IMAGE-STACK.md` (2026-10-02); where this report disagrees, this one
is newer and says why.

## 0. In one paragraph

Keep the installed, Apache-2.0 Qwen stack (Qwen-Image-2512 for portraits, Qwen-Image-Edit-2511 for every reference
view) — the wave-2 joint identity sheet already holds wardrobe, pattern and accessory tokens across the whole pack
(verified on the two packs drawn on 2026-10-02). What fails today is the pipeline around it, not the model: the
portrait comes out **photographic in a Cartoon production**, the sheet's **three-quarter tile is a profile** (2 of 2),
the default face box **cuts off the chin**, the identity line reaches the image model **in Arabic**, expressions do
not follow the four requested emotions, and the MediaPipe face check **cannot run** because ComfyUI does not see
`/models/detection` (missing `detection:` key in `docker/comfyui/extra_model_paths.yaml`, not a cache). V2 fixes these
with prompt/graph changes, a 3-view sheet plus the installed Multiple-Angles LoRA for the three-quarter view, a
generate → verify → repair loop, and one new local vision-language model (Qwen3.5-4B, Apache-2.0, 9.3 GB, runs in core
ComfyUI's `TextGenerate`) that (a) describes an uploaded reference so REFERENCE mode stops inventing the look and
(b) judges view, style, expression and identity tokens. Identity similarity is measured per style with licence-clean
CPU models: SFace (Apache-2.0) for Realistic, CCIP (OpenRAIL) for Anime, DINOv2-small (Apache-2.0) for all, with
honest NOT_MEASURABLE states. One challenger engine is worth an A/B if the user approves 27 GB: **JoyAI-Image-Edit-Plus**
(Apache-2.0, 1–6 references, native in our ComfyUI build).

## 1. Verified inventory (2026-10-02 evening / 2026-10-03, read-only)

**Runtime.** ComfyUI **0.38.1**, frontend 1.53.6, PyTorch 2.13.0+cu130, Python 3.12.3, `--reserve-vram 1.0
--disable-comfy-compiler`; RTX 5090 34.19 GB reported by ComfyUI (32 607 MiB by `nvidia-smi`); host RAM 50.2 GB
(16.5 GB free at the time). 969 node classes; the only `custom_nodes.*` module is `websocket_image_save`. Queue empty.
**VRAM at idle: 22.8 GB of 32.6 GB in use** while ComfyUI's torch held 0.1 GB and Ollama had no model loaded — the
voice/ASR containers (IndexTTS, Habibi, faster-whisper) were resident. A quality sheet pass needs ~24 GB: the acceptance
run must start with the voice services unloaded (§9).

**Weights visible to ComfyUI** (`GET /models/<folder>`):

| Folder | Files (image-relevant in bold) |
|---|---|
| diffusion_models | **qwen_image_2512_fp8_e4m3fn**, **qwen_image_edit_2511_fp8mixed**, minimax_h3_fl2va/ref2va int8, acestep 1.5 xl turbo, minimax_music3 dit |
| loras | **Qwen-Image-2512-Lightning-8steps-V1.0-bf16**, **Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16**, **qwen-image-edit-2511-multiple-angles-lora** (fal, 295 MB, present since 2026-10-02 19:48), H3 turbo ×2 |
| text_encoders | **qwen_2.5_vl_7b_fp8_scaled** (has `lm_head.weight`, 714 vision tensors), qwen3vl_32b_minimax_h3_nvfp4_awq (50 layers, no lm_head), ace/music encoders |
| vae | **qwen_image_vae** (+ audio/video VAEs) |
| detection | **`[]` — but `/models/detection/mediapipe_face_fp32.safetensors` (5 423 900 B) exists on the volume** |
| clip_vision, controlnet, model_patches, style_models, upscale_models, photomaker, background_removal, checkpoints | empty |

**Finding V2-1 (blocker for the face check).** `docker/comfyui/extra_model_paths.yaml` maps checkpoints,
diffusion_models, unet, text_encoders, clip, vae, loras, model_patches, embeddings, upscale_models — **no `detection`,
`clip_vision`, `controlnet`, `style_models`, `background_removal`**. ComfyUI therefore looks for detectors only in
`/opt/comfyui/models/detection/` (contains `put_detection_models_here` only), and `LoadMediaPipeFaceLandmarker.model_name`
lists `options: []` in `/object_info`. `docs/MODELS.md` attributes the empty listing to a cache that "refreshes on the
next ComfyUI start" — a restart will **not** fix it. The yaml is baked into the image (`Dockerfile:22`); the fix is to
add `detection: detection` (and the other four keys for later) and bind-mount the file in `compose.yaml` (as the voice
containers already do with their scripts), then restart `comfyui`. Needs the user's go-ahead (restart).

**Core nodes relevant to V2** (all present, schemas read from `/object_info`):
`TextEncodeQwenImageEditPlus` (image1..3), `TextEncodeQwenImage21` (16 refs, Qwen-Image-2.1 only), `TextEncodeJoyImageEdit`
(clip, prompt, vae, images 0..6), `HiDreamO1ReferenceImages` (up to 100), `TextEncodeBooguEdit`, `TextEncodeMageFlowEdit`,
`TextEncodeMingImageEdit`, `TextEncodeZImageOmni`, `ReferenceLatent`, `FluxKontextMultiReferenceLatentMethod`,
`LoadMediaPipeFaceLandmarker` / `MediaPipeFaceLandmarker` (outputs FACE_LANDMARKS + BOUNDING_BOX; `detector_variant`
short/full/both) / `MediaPipeFaceMask`, `SDPose*`, `SAM3_Detect`, `LoadBackgroundRemovalModel` / `RemoveBackground`,
`ImageCrop`, `ImageCropV2`, `ImageStitch`, `ImageScaleToTotalPixels`, `PreviewAny`, and **`TextGenerate`** (clip, prompt,
max_length, sampling on/off, optional image/video/audio, `thinking`, `system_prompt`) → STRING.
`CLIPLoader.type` includes `qwen_image, flux2, omnigen2, hidream, joyimage, boogu, krea2, mage, ideogram4, lens, ovis,
longcat_image, minimax, …`.

**Which installed encoder can describe a picture (`TextGenerate`)?** Read in `comfy/sd.py` and `comfy/text_encoders/*`:
- `qwen_2.5_vl_7b_fp8_scaled` (Qwen-Image's encoder): **no**. `Qwen25_7BVLI_Config.lm_head = False` and the line that
  would create it is commented out (`llama.py:1397`, "todo: should this be tied or not?"); logits would fall back to the
  input embedding, which is untied in the 7B, so the file's `lm_head.weight` is ignored and output would be garbage.
  `QwenImageTEModel` has no generate path. Not tested (GPU reserved) — read from source.
- `qwen3vl_32b_minimax_h3_nvfp4_awq`: **no** — truncated to 50 of 64 layers, "no final norm, no lm_head" (`llama.py:366`).
- **Full Qwen3-VL-4B/8B and Qwen3.5-0.8B…27B checkpoints: yes** — `qwen3vl.py` and `qwen35.py` implement `generate`
  with vision (`Qwen35ImageTokenizer`), detected from the weights (`sd.py:1716-1732`), MTP speculative decoding
  supported. So a vision-language model can run inside our ComfyUI with zero custom nodes once its weights exist.

**Ollama** (`ollama/ollama:0.12.3`, `compose.yaml:195`): only `qwen3:14b` (Q4_K_M, 8.6 GB). 0.12.3 predates Qwen3-VL
support (needs ≥ 0.12.7 per the Ollama library page); Qwen3.5 needs a newer Ollama still.

**Measured engine time** (ComfyUI `/history`, `execution_start → execution_success`, 92 items):

| Pass | Settings | Engine time |
|---|---|---|
| Portrait T2I 2512 | Lightning 8 steps, 1024×1280 | 4.1–11.5 s warm; 21.5–35.2 s after a model switch; 75.5 s cold |
| Edit-2511, 1 ref | Lightning 4 steps, 1024×1280 | 18–22 s (previous study); other 4-step edits in the log 4.8–6.7 s (size not recorded in this summary) |
| Edit-2511, 3 refs | Lightning 4 steps, 1344×768 frames | 12.1–13.5 s |
| **Identity sheet** (new) | **quality: no Lightning, 24 steps, cfg 4, 1664×1216, 2 refs** | **133.6 s and 133.9 s** |
| **Derived view, 3 refs + Multiple-Angles LoRA** (new) | Lightning 4 steps, 832×1472 / 1280² | **14.9–16.1 s** |

So today's default pack (portrait + sheet + FULL_BODY + EXPRESSION) costs ≈ 3 min of engine time.

## 2. What the wave-2 pipeline actually produced (two packs, 2026-10-02 23:15–23:31)

Files: `var/backups/phase0-cleanup-20261002-2347/library/image/2026/10/` (the studio was cleaned afterwards).
Both characters were CARTOON. Character A (no stored identity line): portrait `gen-8aa12b8831`, sheet `gen-45204f312f`,
face crop `gen-02448df063`, full body `gen-e94c5306d9`, expressions `gen-6d2ddf5ac7`. Character B (identity line in
Arabic): portrait `gen-36fad8a686`, sheet `gen-c6607daa38`, face crop `gen-10fd0550e2`, full body `gen-de7c3519ed`,
expressions `gen-76c569ac66`.

What holds (the joint sheet works): inside each pack the music-note shirt, navy trousers and brown shoes (A), and the
embroidered dress, red sash, patterned head cloth, silver pendant and bare feet (B) are identical in every tile, the
full-body view and the expression grid. The token flips seen in the Kite sheets (beard, shoe colour, patch layout) are
gone. This confirms the previous study's diagnosis: composition of references, not a new model, fixes token drift.

What fails:
1. **Portrait style.** Both portraits are studio *photographs* although the direction is Cartoon (3D feature
   animation). The wave-2 prompt puts "Head-and-shoulders portrait, centred, … plain mid-grey background" first and
   the medium after it; with 2512's realism prior and the 8-step Lightning LoRA that reads as a photo brief. (The Kite
   portraits, whose prompt led with the style, were stylised.) The sheet then switches to stylised CG, so portrait,
   face crop and sheet disagree.
2. **Age/face drift portrait → sheet** follows from (1): B is a woman of ~35 in the portrait and a teenager in the
   sheet; A becomes younger and rounder. The identity line carries no age.
3. **View labels.** Asked for "front, three-quarter turned 45° left, exact left profile, back": A's sheet has front,
   left profile, **right** profile, back; B's has front, left profile, left profile (near duplicate), back. **No
   three-quarter view in either**, so the THREE_QUARTER and SIDE tiles are mislabelled. Multi-figure prose angles are
   unreliable; profiles and backs are reliable.
4. **Face crop.** `DEFAULT_FACE_BOX` (x 22 %, y 0, w 56 %, h 45 %) cuts B's face at the lips (no chin/jaw), and the
   crop is photographic while the pack is CG; it is image 2 of every derived view and of every one-character shot frame.
5. **Identity line language.** B's line went to Qwen-Image verbatim in Arabic ("Identity: شعر داكن …"), including odd
   machine phrasing. Qwen-Image's prompts are Chinese/English; the colours partly survived, details are at risk.
6. **Expressions.** Requested joy / worry / anger / surprise; A got worry, neutral, surprise, surprise; B got content,
   worry, smile, shock. Anger appears in neither. One 2×2 grid pass does not control four emotions.
7. Prompt hygiene: `sheetPrompt`/`viewPrompt` strip trailing periods and join with spaces, producing run-ons ("…back
   view Identical face…"). Minor, but sentence boundaries help the encoder.
8. Tile resolution: equal quarters of 1664 px are **416 px wide**; the FRONT tile's face is ~60 px wide, and that tile
   is image 1 of every derived view and of shot frames. The 832×1472 FULL_BODY view is the better body reference.

## 3. Candidates — ranked comparison (current as of 2026-10-03)

Download times at the measured ~5 MB/s. "Excluded" = licence forbids running the weights in a commercial product.

| # | Candidate (release) | Licence | Download / VRAM on 5090 | ComfyUI 0.38.1 | Identity evidence | Styles | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Qwen-Image-Edit-2511** (2025-12-23) + **Qwen-Image-2512** (2025-12-31), installed | Apache-2.0 | installed (20.5 + 20.4 + 9.4 GB enc); fits with encoder offload; times in §1 | core, `TextEncodeQwenImageEditPlus` ≤ 3 refs | model card: "improved character consistency", viewpoint/lighting LoRAs merged; **our packs: tokens hold across a joint sheet** (§2); community rating 80/100 vs klein 9B 65/100 | Cartoon proven here; Realistic is 2512's headline; Anime untested here | **Primary** |
| 2 | **JoyAI-Image-Edit-Plus** (JD, Edit 2026-04-02, Plus 2026-06-23, ComfyUI 2026-07-17) | Apache-2.0 | int8 DiT 16.43 GB + Qwen3-VL-8B int8 enc 10.06 GB + Wan2.1 VAE 0.25 GB = **26.75 GB (~89 min)**; bf16 DiT 32.5 GB does not fit; reference workflow 30 steps, cfg 4, 1024² → expect ~2–4× an un-distilled 2511 pass (unmeasured); "Distilled" announced, not released | **core** (`TextEncodeJoyImageEdit`, `CLIPLoader type joyimage`, `CFGNorm`) | paper (arXiv 2605.04128): human A/B of JoyAI-Image-Edit vs Qwen-Image-Edit-2511 — Consistency 35.9 % vs 31.7 %, Overall 45.3 % vs 36.1 % (as indexed; the table was not readable in this session); explicit canonical-view and camera yaw/pitch editing; 1–6 refs | claims general; no stylised-character evidence found | **Challenger for the A/B** (needs go-ahead) |
| 3 | HiDream-O1-Image (2026-05-08) | MIT (+ Gemma 4, Apache-2.0 since 2026-04-02) | dev fp8 8.07 GB + `gemma4_e4b_it_fp8_scaled` 9.06 GB = **17.1 GB (~57 min)**; dev 28 steps cfg 1, full 50 steps; up to 2048² | core (`CheckpointLoaderSimple`, `HiDreamO1ReferenceImages`) | own UniSubject benchmark (subject consistency Q-SC); no character-sheet tests; too new for community evidence | claimed both | Later; second opinion only |
| 4 | FireRed-Image-Edit-1.0 (2026-02-12) | Apache-2.0 (model card) | Comfy-Org has bf16 only (40.9 GB; won't stay resident); community FP8 ~20 GB | drop-in: same Qwen-Edit architecture and graph | "consistency similarity loss" on RoIs for identity; GEdit/ImgEdit claims, no identity metric | general | Optional drop-in A/B only if JoyAI is refused |
| 5 | Boogu-Image-0.1-Edit (2026-06-16) | Apache-2.0 | Qwen3-VL-8B enc + FLUX.1 VAE; bf16/fp8/int8/nvfp4 + Turbo | core (`TextEncodeBooguEdit`) | node tooltip: "focuses on one reference per sample" | — | No (single-reference) |
| 6 | Mage-Flow-Edit (Microsoft, 4B) | MIT | ~18–20 GB peak (A100 figure); Turbo 1 s/edit | core (`TextEncodeMageFlowEdit`: refs resized to output) | GEdit-class claims; one-to-many diversity, no identity metric | — | No (refs forced to output size; no identity evidence) |
| 7 | FLUX.2 [klein] 4B | Apache-2.0 | ~13 GB, sub-second, 4 steps | core (`flux2`) | community: "4B has very weak consistency" | realistic-leaning | No |
| 8 | OmniGen2 | Apache-2.0 | 7.9 GB + 3B VLM | core | authors: in-context results "sometimes differ", gap to GPT-4o | both, weaker | No |
| 9 | Bagel (ByteDance, 14B MoT) | Apache-2.0 | ~30 GB bf16 | custom nodes only | editing below 2511 on public benchmarks | — | No |
| — | Qwen-Image-2.1 (2026-09-20) | **Qwen Research License** (no commercial use without a separate licence) | 7B DiT + Qwen3-VL-8B; 10 refs | core (`TextEncodeQwenImage21`) | "preserve identity for people and products" | both | **Excluded** (licence) — ask Alibaba for a commercial licence if the A/B ever needs 10 refs |
| — | Qwen-Image-2.0 / 2.0 Pro (2026-02-10), Qwen-Image-3.0 (2026-07-21) | API only, no weights | — | API nodes | — | — | Out of scope (local) |
| — | FLUX.2 [dev] 32B, FLUX.2 [klein] 9B, FLUX.1 Kontext [dev] | FLUX Non-Commercial | — | core | klein 9B 65/100 consistency (community) | — | **Excluded** (outputs may be used, the model may not be run commercially) |
| — | USO, UNO, DreamO, InfiniteYou, PuLID-FLUX, ACE++ | adapters on **FLUX.1 [dev] / Fill-dev** (non-commercial base); InfiniteYou/PuLID also need insightface | — | USO core, rest custom | strong on real faces (published) | realistic | **Excluded** (base licence) |
| — | InstantID, IP-Adapter FaceID, PhotoMaker V2 | insightface models non-commercial / SDXL | — | custom; PhotoMaker core is V1 | — | realistic | **Excluded** / quality floor |
| — | Ideogram 4 open weights (NCMA 2026-06-03) | non-commercial | — | core | — | — | **Excluded** |
| — | Krea 2 Raw/Turbo (2026-06-22), Z-Image Turbo/Base | community licence / Apache-2.0 | 12.9B / 6B | core | text-to-image only (Z-Image-Edit "to be released" as of 2026-08) | — | Not needed (no reference conditioning) |
| — | Ming-Image-0.1-Design (2026-09-22) | MIT | 6B | core (`TextEncodeMingImageEdit`) | graphic/layer design focus | — | Not relevant |

**Helper LoRAs for Qwen-Edit-2511.** fal Multiple-Angles (installed; Apache-2.0; 96 poses `<sks> {azimuth}
{elevation} {distance}`; stacks with Lightning at 1.0 in fal's own graph) — **use it for the three-quarter view and
for re-rendering SIDE/BACK at full resolution**. lightx2v also publishes an **8-step** Lightning LoRA for 2511
(`Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16`, 849 608 296 B, Apache-2.0) — a "balanced" sheet mode between the
4-step draft and the 134 s quality pass. Comfy-Org also ships `qwen_image_edit_2511_int8_convrot` (20.5 GB) and
`qwen_image_nvfp4` (2512 only, 19.8 GB) — no measured gain over fp8mixed for us; not proposed.

## 4. Identity-measurement and description tools

| Tool | Licence | Size | Runs where | Good for | Limits |
|---|---|---|---|---|---|
| MediaPipe BlazeFace + Face Landmarker (`Comfy-Org/mediapipe`) | Apache-2.0 | 5.4 MB, **already on the volume** | ComfyUI core (after Finding V2-1 is fixed) | face count/box for upload validation and crops; realistic and 3D-CG faces | anime faces unreliable; bbox only via `PreviewAny` text |
| **YuNet** 2023mar (OpenCV Zoo) | MIT | 232 589 B | CPU, ONNX | face box + 5 landmarks for alignment | photographic/CG human faces |
| **SFace** 2021dec (OpenCV Zoo) | Apache-2.0 | 38 696 353 B (int8 9.9 MB) | CPU, ONNX, 112×112 aligned | **Realistic identity**: LFW 99.40 %; OpenCV's thresholds cosine ≥ 0.363 / L2 ≤ 1.128 (LFW), cosine 0.275–0.340 on pose/age sets (CPLFW/AgeDB/CALFW), 0.212 on frontal-vs-profile (CFP-FP) | trained on real faces; not meaningful for anime; profiles weak |
| AuraFace v1 (`glintr100.onnx` only) | Apache-2.0 | 260.7 MB | CPU/GPU ONNX | stronger second opinion (LFW 99.65, CFP-FP 95.19) | **the same repo ships insightface's SCRFD/landmark/genderage files (non-commercial) — do not download those**; no published threshold |
| insightface buffalo_l / antelopev2 (ArcFace) | code MIT, **models non-commercial research only** (commercial licence sold separately) | — | — | best accuracy | **Excluded** |
| DeepFace | MIT wrapper; bundled weights (ArcFace, Facenet, VGG-Face, GhostFaceNet…) derive from MS1M/VGGFace2/insightface data with research terms | — | — | — | only its SFace/YuNet backends are clean → use OpenCV directly |
| **DINOv2-small** (`Xenova/dinov2-small` ONNX) | Apache-2.0 | 24.5 MB quantized / 88.5 MB fp32 | CPU, ONNX | style-robust visual similarity of head/face crops for **every** style | not an identity model: same-style strangers can score high; must be calibrated (§7) |
| DINOv3 | custom Meta "DINO Materials" licence (commercial allowed with restrictions) | — | — | — | not needed; DINOv2 is clean |
| **CCIP** (`deepghs/ccip_onnx`, caformer) | OpenRAIL (use restrictions, commercial allowed) | `model_feat.onnx` 150 MB (b36 variant 384 MB) | CPU, ONNX | **Anime identity**: F1 0.941, same character when difference ≤ 0.213 (b36 variant) | anime-trained; 3D-CG cartoons untested |
| deepghs anime_face_detection (YOLO n/s, ONNX) | MIT on the card | 3–11 M params | CPU, ONNX | anime face boxes (F1 0.94–0.95) | YOLO-family weights; Ultralytics asserts AGPL over models trained with its code → legal check before shipping; the VLM can return boxes instead |
| **Qwen3.5-4B** (`Comfy-Org/Qwen3.5`, `qwen3.5_4b_bf16.safetensors`) | Apache-2.0 (Qwen3.5, Feb–Mar 2026, 201 languages incl. Arabic) | **9 319 828 320 B (~31 min)** | **ComfyUI core `TextGenerate`** (verified in source) | describe uploads; judge view/style/expression; audit identity tokens; boxes | VLM judgements have an error rate → spot-check in the A/B |
| Qwen3.5-9B (same repo) | Apache-2.0 | 19 306 312 328 B (~64 min) | ComfyUI | MMMU 78.4, OCRBench 89.2 | 19 GB bf16 beside Qwen-Edit stresses the 50 GB host RAM; only if 4B fails the A/B |
| Ollama `qwen3.5:9b` / `qwen3-vl:8b` | Apache-2.0 | 6.6 GB / 6.1 GB | `llm` service | JSON-schema structured output; already the story engine's server | needs an Ollama image upgrade from 0.12.3 (qwen3-vl ≥ 0.12.7) and a service restart; VRAM outside ComfyUI's manager |
| Qwen3.8-27B (2026-08-14) | Apache-2.0 | ~18 GB Q4 | Ollama | strongest open VLM | too large to share the card with image jobs |

## 5. Recommended workflow

### 5.1 The canonical reference pack (per character, all three styles)

| Ref | How drawn | Size | Seed | Stored as |
|---|---|---|---|---|
| PORTRAIT | 2512 T2I (Auto/Manual) or Edit-2511 from the upload (Reference); must pass the style gate | 1024×1280 | identity seed (+k for candidate k) | `portraitAssetId` |
| FACE | crop of the portrait at the detected face box + 25 % margin (chin included), upscaled lanczos to 1024² — only after the portrait passed the style gate | 1024² | — | `CharacterRef FACE` |
| SHEET | **one Edit-2511 quality pass, three figures**: front · left-facing profile · back (image1 portrait, image2 FACE) | **1728×1216** (3 × 576) | identity seed | sheet asset |
| FRONT / SIDE / BACK tiles | cut from the sheet at the **background gaps** (column profile of non-grey pixels on the CPU), not equal quarters; "fewer than 3 figures" = sheet failure | ~576×1216 | — | `CharacterRef` ×3 |
| FULL_BODY | Edit-2511 + Multiple-Angles `<sks> front view eye-level shot wide shot`; refs (FRONT, FACE, SHEET) | 832×1472 | seed+11 | **the body reference for shot frames** |
| THREE_QUARTER | `<sks> front-left quarter view eye-level shot wide shot`; same refs | 832×1472 | seed+13 | `CharacterRef` |
| SIDE_HR / BACK_HR (optional) | `<sks> left side view …` / `<sks> back view …` at full resolution | 832×1472 | seed+23/29 | replaces the low-res tile for frames |
| EXPRESSION ×4 | **one pass per emotion**, close-up, refs (FACE, FRONT, SHEET) | 1024² each | seed+17+i | `CharacterRef EXPRESSION` with `emotion` |
| OUTFIT | wide shot, "complete wardrobe in detail" | 832×1472 | seed+19 | `CharacterRef` |

Reference order is fixed for every derived pass (Edit-2511 takes three): **image1 = pose/body truth (FRONT tile, or
FULL_BODY once it exists), image2 = FACE, image3 = SHEET**; for expressions image1 = FACE (no body pose to leak).
Shot frames: image1 = plate, image2/3 = each character's **FULL_BODY** (fallback FRONT tile, then portrait); a lone
character also gets FACE. Every ref records `references[]`, `seed`, prompt, workflow hash and its `checks` (§7); the
appearance lock (`canChangeAppearance`) is unchanged.

### 5.2 Graph outlines (all core nodes; `src/server/workflows/qwen-image.ts` builders)

- **Portrait T2I** (`qwenTextToImage`, unchanged graph): prompt = style-medium sentence first (§5.4) → view sentence →
  English identity line (with age) → `direction.character` → `direction.visual` → `direction.avoid`. Auto mode draws
  three candidates (seeds s, s+1, s+2) in one ComfyUI prompt (`batch_size` 1 × 3 samplers or three prompts).
- **Portrait from upload** (`qwenEdit`): img1 = upload (validated), img2 = upload face crop (MediaPipe box +25 %,
  1024²); prompt "Redraw the person in image 1 (face exactly as image 2) as {medium}: head-and-shoulders portrait …
  keep face shape, age, skin tone, hair, facial hair and glasses exactly; {identity line from the description}".
  Realistic: same, "photograph" medium. Quality mode for the upload portrait (it is the identity anchor).
- **Identity sheet** (`qwenIdentitySheet`): unchanged chain, `width 1728`, 3 tiles, new prompt (§5.4); keep the
  `ImageCrop` outputs as a fallback but let the worker re-cut at the gaps from the full sheet.
- **Derived view** (`qwenView`): unchanged (3 refs, Lightning + Multiple-Angles LoRA 1.0, shift 3.1, 4 steps, cfg 1).
- **Face check** (`faceCheck`): unchanged, runs once Finding V2-1 is fixed; detector_variant `both`, min_confidence 0.5.
- **New `vlmJudge`**: `LoadImage` ×N → `CLIPLoader(qwen3.5_4b_bf16)` → `TextGenerate(image, prompt, max_length 512,
  sampling off, thinking false, system_prompt)` → `PreviewAny` per question; the worker parses JSON with the existing
  lenient parser. Batch all judgements of one pack into one ComfyUI prompt (one model load).

### 5.3 Per creation method

| Method | Input | Look design | Portrait | Then |
|---|---|---|---|---|
| **Auto** | name, style, language/dialect (+ optional one-line idea) | story engine designs the profile and writes the **identity line in English** (hair, eyes, skin tone, **age**, build, facial hair, every garment with colour/pattern, shoes, accessories, restrictions such as "no moustache") plus an Arabic display gloss | 3 candidates → VLM judge picks the one with full token coverage and the right medium (ties → lowest seed) | sheet → views → checks |
| **Manual** | name/description and any of appearance, wardrobe, personality, language, dialect, style | producer's fields are kept verbatim for display; a normaliser (story engine) writes the English identity line from them and fills only missing look fields, marking them "designed" | 3 candidates, producer picks (auto-pick by the judge if the producer does not) | same |
| **Image Reference** | upload (+ optional fields) | **describe first (§8)**: the VLM's English description becomes the locked look fields; the design step may only add what is not visible (e.g. shoes in a head shot) and marks those "designed" | Edit-2511 from the upload + its face crop, quality mode, into the production's medium | same, plus identity vs the upload (Realistic only) |

Personality, language and dialect do not enter image prompts; names never enter image prompts (people are described
by appearance, as today). Any Arabic field is translated before it reaches an image prompt.

### 5.4 Per style (same models; what changes is the prompt lead, the mode and the check)

| | Cartoon (3D feature animation) | Anime (premium 2D) | Realistic |
|---|---|---|---|
| Portrait lead sentence | "3D animated feature-film character portrait, stylized CG render, not a photograph:" | "2D anime character portrait, cel-shaded illustration with clean line art, not a photograph, not 3D:" | "Photorealistic head-and-shoulders portrait photograph, 85 mm lens:" |
| Portrait mode | Lightning 8-step, **style gate**; on gate failure redraw seed+1, then quality mode (30 steps, cfg 4) | same | Lightning 8-step (realism is 2512's strength) |
| Sheet prompt medium | "rendered as stylized 3D animated characters" | "drawn as a 2D anime model sheet, clean line art, flat cel shading" | "photographed as a real person in a studio" |
| Face detector | MediaPipe (works on CG humans; verify in A/B) | VLM box (licence-clean) or anime detector after legal check | MediaPipe / YuNet |
| Identity metric | DINOv2 face-crop cosine (calibrated) + token audit | **CCIP** difference ≤ 0.213 + DINOv2 + token audit | **SFace** cosine ≥ 0.363 (frontal) + DINOv2 + token audit |

Sheet prompt (3-view), joined with sentence breaks: "Character model sheet of the person in image 1, whose face is
image 2, {medium}. Exactly three full-body figures side by side on one plain mid-grey background with clear space
between them. Left: front view, facing the camera. Centre: profile view, the figure facing the left edge of the
picture. Right: back view. Identical face, hair, skin, age, build and the exact same outfit in all three. {identity
line}. Standing straight, arms relaxed at the sides, neutral expression, feet visible, even studio light. No text, no
labels, no props. {direction.character} {direction.visual}." Expression pass: "<sks> front view eye-level shot
close-up. The face of the person in image 1, exactly as in images 1 and 3: {cue}. {identity line}. {medium}. Plain
mid-grey background." with cues joy = "a wide genuine smile, raised cheeks, eyes narrowed", worry = "inner eyebrows
raised and drawn together, lips pressed", anger = "brows lowered and drawn together, glaring eyes, tight lips, flared
nostrils", surprise = "eyebrows raised high, eyes wide open, mouth open in an O".

### 5.5 Quality vs speed modes (engine time per pack; "meas." = from `/history`, "est." = to be measured in §9)

| Mode | Portrait | Sheet | Views (FULL_BODY, 3/4, 4 expressions, OUTFIT = 7 passes) | Checks | Pack total |
|---|---|---|---|---|---|
| Draft | Lightning 8-step ×1 (4–12 s meas.) | Lightning 4-step (~25–35 s est.) | Lightning + LoRA (~15 s meas. each) | CPU metrics only | ~2.5 min est. |
| **Standard (default)** | Lightning ×3 + style gate (~30 s) | **quality 24 steps cfg 4 (134 s meas. at 4-view; 3-view similar)** | Lightning + LoRA (~15 s each) | CPU + VLM judge (~30–60 s est.) | **~5 min** |
| Balanced sheet (if the 8-step LoRA is approved) | as Standard | Lightning 8-step (~45–60 s est.) | as Standard | as Standard | ~4 min |
| Best (hero characters) | quality 30 steps cfg 4 (~60–90 s est.) | quality 40 steps (~220 s est.) | quality 24 steps cfg 4 (~2 min est. each) | full | ~20 min est. |

### 5.6 Seeds and references policy

One `identitySeed` per character (`canon.identitySeed`, else FNV-1a of the id — unchanged); fixed offsets per view
(table §5.1); auto-retry = seed + 1 (once); producer redraw = previous seed + 1; every seed recorded. Seeds are for
reproducibility and fair A/B, not identity: identity comes from the references and the English identity line. The
canonical pack is versioned (`canon.refsVersion`); a redraw never deletes previous assets.

## 6. Prerequisite fixes before any GPU acceptance run (code/config, no downloads)

1. Finding V2-1: `detection:` (+ `clip_vision`, `controlnet`, `style_models`, `background_removal`) in
   `extra_model_paths.yaml`, bind-mounted; restart `comfyui`; `LoadMediaPipeFaceLandmarker` must list the file.
   Correct `docs/MODELS.md` ("refreshes on the next start" is wrong).
2. Identity line in **English** for prompts (`canon.identityLine`), Arabic kept as `canon.identityLineDisplay`; add
   age; `identity.ts` must not pass non-Latin script to image prompts (translate or refuse with a reason).
3. Portrait prompt: medium sentence first (§5.4); the sheet prompt gets `direction.character`.
4. Face crop from a detected box with margin (default box only if no detector, and then y 4–62 %, not 0–45 %).
5. 3-view sheet + LoRA three-quarter; tiles cut at gaps; shot frames use FULL_BODY.
6. Sentence joins in `sheetPrompt`/`viewPrompt` keep the full stops.
7. Expressions as four single passes (or keep the grid only if the A/B shows it labels correctly).
8. GPU hygiene: unload IndexTTS/Habibi/whisper (or stop their containers) before an image batch; record peak VRAM.

## 7. Automatic identity check

**Loop: generate → verify → repair (one retry) → report.** Runs after each pack, under the GPU lease for the VLM part,
on the CPU for embeddings (`onnxruntime-node`, MIT; ONNX models from §4).

Per view the worker computes, against the canonical **FACE** and the **SHEET FRONT tile**:

| Check | Tool | Applies to | Pass rule (provisional, calibrated in §9) |
|---|---|---|---|
| face present / count / size | MediaPipe (Real/Cartoon), VLM box (Anime) | all except BACK | exactly 1 face; height ≥ 18 % (portrait/face/expr) or ≥ 64 px (full body) |
| **identity similarity** | SFace cosine (Realistic); CCIP difference (Anime); DINOv2 cosine (all styles, head crop 224²) | FRONT, 3/4, FULL_BODY, FACE, EXPRESSION, OUTFIT | Realistic: SFace ≥ 0.363 frontal, ≥ 0.30 three-quarter. Anime: CCIP ≤ 0.213. Cartoon: DINOv2 ≥ the 5th percentile of same-character scores from §9, and only **gating** if same-vs-different AUC ≥ 0.90 on our set, else **advisory** |
| identity tokens | VLM audit: one yes / no / not-visible question per token of the identity line | all views | every visible "must" token = yes; any "no" names the token ("beard missing in SIDE") |
| view label | VLM: "where does the nose point / which side faces the camera: front, three-quarter left, three-quarter right, profile facing image-left, profile facing image-right, back" | sheet tiles, 3/4, SIDE_HR, BACK_HR | label = requested (note fal's "left side view" = nose to image-left) |
| style / medium | VLM: "photograph, 3D CG render, 2D anime illustration, 2D cartoon drawing" | portrait, sheet, every view | = production style |
| expression | VLM emotion label | EXPRESSION ×4 | = requested emotion |
| layout | CPU column profile of the sheet | SHEET | exactly 3 figures, none touching the border |

Failure handling and honest reporting:
- Each ref gets `checks: { identity: {metric, value, threshold, status}, tokens: {asked, yes, no[], notVisible[]},
  view: {expected, judged}, style: {expected, judged}, expression?, detector, judge, retried }` with `status` ∈
  **PASS / FAIL / ADVISORY / NOT_MEASURABLE / NOT_CHECKED**. A profile or back view is **NOT_MEASURABLE** for face
  identity (said in words, never shown as PASS); if the VLM or a detector is missing the check is **NOT_CHECKED** with
  the reason; Cartoon similarity stays **ADVISORY** until calibration proves separation.
- FAIL on tokens, view, style or gating identity → one automatic redraw with seed + 1; if it fails again, keep the
  better-scoring picture, mark the ref FAIL, and the Appearance tab shows the reason and "Redraw this view"; the
  Casting → Preproduction handoff gets `identity-consistency` ok = false with the failing views — preflight warns
  before frames are drawn from a FAIL ref.
- Scores and judge outputs go into asset provenance and the activity feed ("Amina — side view: tokens 9/9, view
  'profile facing image-left' ✓, face identity not measurable for a profile").
- The VLM's own error rate is estimated in §9 from human spot checks and printed next to its verdicts.

## 8. REFERENCE-mode description step (fixes REVIEW-WAVE2 finding 3; needs finding 2 for upload validation)

Order: upload → CPU validation (size, sharpness — exists) → **MediaPipe face check** (count = 1, height ≥ 18 %, not
cut by the border; stored on the asset) → **VLM description** → design (only non-visible fields) → portrait from the
upload → pack → checks (+ SFace upload-vs-portrait for Realistic; stylised styles report it as ADVISORY because a
stylised face is not expected to match a photograph numerically).

VLM call (Qwen3.5-4B in ComfyUI `TextGenerate`, sampling off, thinking off; image downscaled to ≤ 1.0 MP), system
prompt: "You describe the visible appearance of one person for a costume and character designer. Describe only what is
visible. Do not guess names, ethnicity, nationality, religion or health. Use plain English colour words." User prompt
asks for JSON:
`{ ageRange, build, skinTone, faceShape, hair: {colour, length, texture, style}, facialHair, eyes: {colour|"not
visible"}, eyebrows, glasses, marks[], clothing: [{item, colour, pattern}], footwear|"not visible", accessories[],
notVisible[], confidence: {field: low|medium|high} }`.
The worker validates against a schema (lenient parser + one repair round as for the story engine), stores it on the
pending reference (`description`, `judge: qwen3.5-4b`, workflow hash), writes the English identity line from it, and
the Character page shows it for confirmation/editing **before** the portrait is queued. Fields marked low confidence
are shown as such, not silently used. Arabic display text is produced by the story engine from the English fields.
Privacy: the upload never leaves the machine on this path; a hosted vision model (Anthropic/MiniMax) is used only if
the producer opts in. A "this is me / I have the person's consent" confirmation is required for photos of real people.

## 9. A/B test plan for the acceptance phase (GPU)

**Preconditions** (all read-only to verify): §6 items 1–8 merged; `node scripts/check-comfy-nodes.mjs` green;
`/models/detection` lists the MediaPipe file; Qwen3.5-4B present; voice/ASR services unloaded (`nvidia-smi` < 2 GB
used before the run); intake paused for other jobs; fetcher paused.

**Characters** (6 new test characters, English identity lines written once and frozen for all arms; 2 per style):
- Cartoon C1 "elderly kite-maker, about 70: short grey hair, full white beard, round wire glasses, patchwork jacket of
  brown, teal, ochre and brick squares, olive trousers, tan leather sandals, silver crescent pendant".
- Cartoon C2 "girl about 10: two black braids, amber eyes, freckles, olive T-shirt, denim overalls torn at the left
  knee, white sneakers with red laces, red string bracelet on the right wrist".
- Anime A1 "student about 17: shoulder-length teal bob with a white hair clip on the left, violet eyes, navy sailor
  uniform with a red neckerchief, black knee socks, brown loafers".
- Anime A2 "courier about 30: spiky black hair, scar through the right eyebrow, orange bomber jacket with a white star
  patch on the left sleeve, grey cargo trousers, yellow sneakers".
- Realistic R1 "pharmacist about 45: greying black hair in a low bun, rectangular black glasses, small mole above the
  left lip, white lab coat over a burgundy blouse, black flats".
- Realistic R2 "mechanic about 28: short curly dark-brown hair, trimmed stubble beard, silver stud in the left ear,
  faded blue coveralls with a name patch, black work boots".
- REFERENCE inputs: two photoreal stand-in "uploads" generated by 2512 for the test (labelled as test fixtures, not real
  people) plus one consenting real photo if the user provides one; one anime drawing; each run in two target styles.

**Arms** (same seeds per character across arms):
- **A0** baseline = current wave-2 code (view-first portrait, 4-view sheet, default face box).
- **A1** V2 = §6 fixes + §5 pack (style-first portrait with gate, 3-view sheet, LoRA three-quarter, detected face crop,
  single-expression passes), Standard mode.
- **A2** = A1 with the portrait in quality mode (tests whether Lightning causes the photo look).
- **A3** = A1 with the sheet on the 8-step LoRA (only if downloaded) — speed/quality trade-off.
- **J1** (only if approved) = A1 with JoyAI-Image-Edit-Plus replacing Edit-2511 for the sheet and views (refs FRONT,
  FACE, SHEET, + SIDE and BACK tiles since it takes 6; 30 steps, cfg 4, 1024 base, `CFGNorm` as in its workflow).
- **V-test** (description): Qwen3.5-4B (ComfyUI) on the 3 uploads + 6 portraits; human scores each field correct /
  wrong / hallucinated; optional Qwen3.5-9B on the same set if 4B scores < 90 %.

**Metrics recorded per view** (`docs/evidence/character-image-v2-ab.md`, with asset ids): identity metrics of §7 (all
three embeddings for every style, so calibration data exists), token audit counts, view label, style label, expression
label, face box, engine ms, peak VRAM (`/system_stats` sampled every 2 s), retries. **Human ground truth**: two raters,
blind to arm, score each pack "same character in every view?" (1–5), mark every token flip, view error and style
error; 20 % of VLM verdicts are re-checked by a rater to measure judge accuracy. **Calibration**: per style, compute
same-character (views of one character) vs different-character (views of the other character of that style, plus the
other arms' strangers) score distributions; report AUC and the threshold at ≤ 1 % false accept.

**Pass criteria for adopting V2 (A1 or A2 over A0):**
- view labels correct for ≥ 90 % of FRONT/3-4/SIDE/BACK refs (A0 baseline: three-quarter 0/2);
- medium correct in 100 % of Cartoon/Anime portraits and views (A0 baseline: portraits 0/2);
- token preservation ≥ 95 % across all views and **zero** must-token flips between sheet tiles;
- Realistic: SFace ≥ 0.363 on every frontal view; Anime: CCIP ≤ 0.213 on every frontal view; Cartoon: DINOv2 AUC
  ≥ 0.90 (else the metric ships as advisory and the token audit carries the gate);
- expressions: ≥ 3 of 4 labelled as requested per character;
- human mean ≥ 4/5 "same character" and no pack rated ≤ 2;
- Standard-mode engine time ≤ 6 min per pack; peak VRAM ≤ 30 GB;
- VLM judge agreement with raters ≥ 90 % (otherwise its verdicts are shown as advisory).
**Challenger adoption (J1 over A1):** ≥ 10 points better token preservation or identity pass rate, no style or view
regression, ≤ 2× engine time; otherwise JoyAI files are removed and the manifest entry dropped.
**Description adoption:** ≥ 90 % of visible fields correct, ≤ 2 % hallucinated fields.

## 10. Downloads that need the user's go-ahead (sequenced; ~5 MB/s; pause the model fetcher during image builds)

| Prio | File(s) | Repo | Size | Time | Licence | Purpose |
|---|---|---|---|---|---|---|
| 0 | none — `extra_model_paths.yaml` mount + `comfyui` restart | — | — | — | — | makes the installed MediaPipe file usable (Finding V2-1) |
| 1 | `text_encoders/qwen3.5_4b_bf16.safetensors` (sha256 `9fb3ae42…0841`) | Comfy-Org/Qwen3.5 | 9.32 GB | ~31 min | Apache-2.0 | REFERENCE description, view/style/expression judge, token audit |
| 1 | `face_detection_yunet_2023mar.onnx` (`8f2383e4…2fa4`), `face_recognition_sface_2021dec.onnx` (`0ba9fbfa…4e79`) | opencv/face_detection_yunet, opencv/face_recognition_sface | 0.23 MB + 38.7 MB | < 10 s | MIT, Apache-2.0 | Realistic identity metric |
| 1 | `onnx/model_quantized.onnx` | Xenova/dinov2-small | 24.5 MB | ~5 s | Apache-2.0 | all-style similarity |
| 1 | `ccip-caformer-24-randaug-pruned/model_feat.onnx` (+ metrics onnx) | deepghs/ccip_onnx | 150 MB | ~30 s | OpenRAIL | Anime identity metric |
| 1 | npm `onnxruntime-node` | npm | per registry at install | — | MIT | runs the ONNX models in the worker (a dependency change) |
| 2 | `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | lightx2v/Qwen-Image-Edit-2511-Lightning | 0.85 GB | ~3 min | Apache-2.0 | Balanced sheet mode (arm A3) |
| 3 | `joyai_image_edit_plus_int8_convrot.safetensors` (`c65b4a65…b274`), `qwen3vl_8b_joyimage_edit_plus_int8_convrot.safetensors` (`2e9cd1e1…cd43`), `wan_2.1_vae.safetensors` (`2fc39d31…976b`) | jdopensource/JoyAI-Image-Edit-Plus-ComfyUI | 16.43 + 10.06 + 0.25 = 26.75 GB | ~89 min | Apache-2.0 | challenger arm J1 |
| 4 (later) | `hidream_o1_image_dev_fp8_scaled.safetensors`, `gemma4_e4b_it_fp8_scaled.safetensors` | Comfy-Org/HiDream-O1-Image, Comfy-Org/gemma-4 | 8.07 + 9.06 GB | ~57 min | MIT, Apache-2.0 | second-opinion engine, only if J1 is inconclusive |
| alt to prio 1 VLM | Ollama image upgrade + `qwen3.5:9b` | ollama | 6.6 GB + image | ~25 min + image | Apache-2.0 | only if the VLM must live in the `llm` service |

Total for the recommended set (prio 0–2): ~10.4 GB, ~35 min. With the challenger: ~37 GB, ~2 h.
Not proposed: AuraFace (only if SFace under-separates Realistic faces; take `glintr100.onnx` alone, 260.7 MB), the
anime YOLO detector (licence check first), any insightface/FLUX-dev/Ideogram/Qwen-Image-2.1 weights.

## 11. Risks and open questions

- The Cartoon similarity metric may not separate characters (DINOv2 sees style more than identity); the token audit
  then carries the gate — said openly in the UI.
- The VLM is new in this stack: its accuracy on fine tokens (lace colour, which wrist) is unknown until §9; keep
  verdicts advisory below 90 % agreement.
- Host RAM (50 GB) with Qwen-Edit + encoder + Qwen3.5 + resident voice models; batch judge calls per pack.
- JoyAI-Image-Edit-Plus: no distilled release yet, 30-step cost; ComfyUI support is three months old.
- Upload rights: REFERENCE mode with real people needs the consent confirmation in §8.

## 12. Sources (read 2026-10-02/03; dates are the sources' own)

Model cards and listings: Qwen-Image-Edit-2511 https://huggingface.co/Qwen/Qwen-Image-Edit-2511 (2025-12-23);
Qwen family timeline https://invideo.io/blog/qwen-image-ai-generator/ (Aug 2026); Qwen-Image-2.1
https://huggingface.co/Qwen/Qwen-Image-2.1, https://runtimewire.com/article/alibaba-qwen-image-2-1-transparent-editing-research-license,
https://alternativeto.net/news/2026/9/alibaba-launches-qwen-image-2-1-a-7b-ai-model-with-native-transparency-and-a-license-change/
(2026-09-20, research licence); Qwen-Image-3.0 API-only https://www.orcarouter.ai/blog/qwen-image-2-1-vs-qwen-image-3-0;
Lightning files https://huggingface.co/api/models/lightx2v/Qwen-Image-Edit-2511-Lightning/tree/main; Comfy-Org Qwen
listings https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI, https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI;
fal Multiple-Angles https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA.
JoyAI: https://github.com/jd-opensource/JoyAI-Image (Edit 2026-04-02, Plus 2026-06-23, ComfyUI 2026-07-17),
https://arxiv.org/abs/2605.04128 (2026-05-05; human A/B numbers as indexed by search),
https://huggingface.co/jdopensource/JoyAI-Image-Edit-Plus-ComfyUI (file sizes, workflow JSON: 30 steps, cfg 4, euler,
1024²), https://comfyui-wiki.com/en/models/joyai/joyai-image-edit-plus,
https://aistudynow.com/how-to-set-up-joyai-image-edit-in-comfyui-no-more-face-drift/ (2026-07-19).
HiDream-O1: https://docs.comfy.org/tutorials/image/hidream/hidream-o1 (2026-05-08, MIT),
https://huggingface.co/Comfy-Org/HiDream-O1-Image, https://arxiv.org/pdf/2605.11061,
https://huggingface.co/Comfy-Org/gemma-4, Gemma 4 Apache-2.0 https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/.
FireRed: https://arxiv.org/abs/2602.13344, https://huggingface.co/FireRedTeam/FireRed-Image-Edit-1.0.
Boogu: https://comfyui-wiki.com/en/news/2026-06-16-boogu-image-edit. Mage-Flow:
https://aiweekly.co/alerts/microsoft-ships-mage-flow-4b-claims-geneval-lead-on-flux2. FLUX.2 klein:
https://huggingface.co/black-forest-labs/FLUX.2-klein-4B; licence matrix https://invideo.io/blog/open-source-image-models-licenses/
(Aug 2026); community klein vs 2511 https://news.hada.io/topic?id=25928. Ideogram 4 NCMA
https://invideo.io/blog/ideogram-ai-image-generator/. Krea 2 https://comfyui-wiki.com/en/news/2026-06-22-krea-2-open-source-text-to-image.
Z-Image https://comfyui-wiki.com/en/news/2026-01-28-alibaba-z-image-base-release, https://localaimaster.com/blog/z-image-base-edit-guide.
Ming-Image https://datanorth.ai/news/ant-group-releases-ming-image-0-1-design. Excluded adapters (USO, UNO, DreamO,
InfiniteYou, PuLID, ACE++, InstantID, IP-Adapter FaceID, PhotoMaker, OmniGen2, Bagel): carried over from
`CHARACTER-IMAGE-STACK.md` §2/§6 and their repositories, not re-read today.
Identity tools: insightface licensing https://www.insightface.ai/solutions/face-recognition-licensing; AuraFace
https://huggingface.co/fal/AuraFace-v1, https://huggingface.co/blog/isidentical/auraface; OpenCV Zoo
https://github.com/opencv/opencv_zoo, https://huggingface.co/opencv/face_recognition_sface,
https://huggingface.co/opencv/face_detection_yunet, thresholds https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html;
DINOv2 https://huggingface.co/facebook/dinov2-small, https://huggingface.co/Xenova/dinov2-small; DINOv3 licence
https://ai.meta.com/resources/models-and-libraries/dinov3-license; CCIP https://huggingface.co/deepghs/ccip,
https://huggingface.co/deepghs/ccip_onnx; imgutils https://github.com/deepghs/imgutils; anime face detector
https://huggingface.co/deepghs/anime_face_detection.
VLMs: Qwen3.5 https://huggingface.co/Qwen/Qwen3.5-9B, https://docs.comfy.org/tutorials/llm/qwen/qwen3_5,
https://huggingface.co/Comfy-Org/Qwen3.5; Ollama https://ollama.com/library/qwen3.5, https://ollama.com/library/qwen3-vl
(requires 0.12.7); Qwen3.8 https://github.com/QwenLM/Qwen3.8 (2026-08-14).
Local evidence: ComfyUI 0.38.1 in `vewbox-comfyui-1` — `comfy/sd.py:1700-1995`, `comfy/text_encoders/llama.py`
(`Qwen25_7BVLI`, `Qwen3VL_32BConfig`), `qwen35.py`, `qwen3vl.py`, `comfy_extras/nodes_textgen.py`; safetensors headers
of `/models/text_encoders/*`; `/history` (92 items); pictures listed in §2.
