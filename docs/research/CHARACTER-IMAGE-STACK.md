# Character image stack — identity across views and shots (research + verification, 2026-10-02)

Scope: the strongest practical pipeline for one character identity across portrait, front, three-quarter, side,
full-body, expression and wardrobe references, and for appearance generation from an uploaded reference, on the
RTX 5090 (32 GB) with ComfyUI 0.38.1 and a studio-compatible licence. Read-only task: no weights downloaded, no
packages installed, no GPU jobs run (a video batch was running); ComfyUI queried over HTTP, files read, evidence
pictures examined. Nothing in `src/` was changed.

## 1. Verified inventory (GET /system_stats, /object_info, /models/*)

- ComfyUI **0.38.1**, PyTorch 2.13.0+cu130, Python 3.12, `cuda:0 RTX 5090` 34.19 GB reported (18.9 GB free while the
  H3 batch ran), `--reserve-vram 1.0`, `--disable-comfy-compiler`. **969 node classes, all core**: the only
  `custom_nodes.*` module is `websocket_image_save` (ships with ComfyUI). No PuLID, InstantID, IP-Adapter, ReActor,
  OmniGen2-custom, or ControlNet-preprocessor packs are installed.
- Core nodes relevant to identity/reference work and present: `TextEncodeQwenImageEditPlus` (clip, prompt, vae,
  image1..3), `TextEncodeQwenImage21` (Qwen-Image-2.1: up to 16 images, `resolution`), `ReferenceLatent`,
  `ImageStitch` (right/down/left/up, spacing), `ImageBatch`, `ImageCrop`, `ImageCropV2`, `CenterCropImages`,
  `ImageScaleToTotalPixels`, `FluxKontextImageScale`, `LoraLoaderModelOnly`, `ModelSamplingAuraFlow`,
  `ControlNetLoader` + `ControlNetApplySD3` (positive, negative, control_net, vae, image, strength, start/end),
  `ModelPatchLoader` + `QwenImageDiffsynthControlnet` (model_patch, vae, image, strength, mask),
  `SDPoseKeypointExtractor` / `SDPoseDrawKeypoints` / `SDPoseFaceBBoxes` / `CropByBBoxes` (OpenPose-wholebody 134 kp),
  `LoadMediaPipeFaceLandmarker` + `MediaPipeFaceLandmarker` (478 landmarks, bbox + score per face, ARKit-52
  blendshapes) + `MediaPipeFaceMask`, `PhotoMakerLoader`/`PhotoMakerEncode` (SDXL, V1 only), `CLIPVisionLoader`/
  `CLIPVisionEncode`/`StyleModelApply`, `USOStyleReference`, `HiDreamO1ReferenceImages`, `TrainLoraNode`.
  `CLIPLoader.type` lists `qwen_image`, `omnigen2`, `hidream`, `flux2`, `lumina2`, … so OmniGen2 and HiDream-O1
  are core-supported families (no weights here).
- Weights visible to ComfyUI: `diffusion_models/` qwen_image_edit_2511_fp8mixed, qwen_image_2512_fp8_e4m3fn (+ the
  H3/ACE/Music3 files); `loras/` Qwen-Image-Edit-2511-Lightning-4steps, Qwen-Image-2512-Lightning-8steps (+ H3
  turbo); `text_encoders/` qwen_2.5_vl_7b_fp8_scaled; `vae/` qwen_image_vae. **Empty**: clip_vision, controlnet,
  model_patches, detection, photomaker, checkpoints, style_models, upscale_models.
- Measured engine time (ComfyUI `/history`, execution_start→success, Lightning LoRAs, cfg 1, euler/simple):
  text-to-image 8 steps 1024×1280 **11.5 s** warm (75 s with the first model load); Edit-2511 4 steps, 1 reference,
  1024×1280 **18–22 s**, 832×1472 17–18 s, 1344×768 10.5 s; 3 references 1344×768 **12–13.5 s**. So a five-view
  reference pack costs ~100 s of engine time today.
- Current graphs (`src/server/workflows/qwen-image.ts`): `qwenTextToImage` (UNETLoader → Lightning LoRA →
  ModelSamplingAuraFlow shift 3.1 → KSampler 8 steps) and `qwenEdit` (1–3 `LoadImage` → `ImageScaleToTotalPixels`
  1.0 MP → `TextEncodeQwenImageEditPlus` for positive and negative → KSampler 4 steps, latent from `EmptySD3LatentImage`
  or `VAEEncode(image1)`). The fal reference workflow for 2511 uses exactly these settings (shift 3.1, 4 steps, cfg 1,
  euler/simple), so the base graph is right; what is missing is reference *composition*, view control and checks.
- Handler (`src/worker/handlers/images.ts`): portrait = T2I from `characterPrompt(c,'PORTRAIT')` (or Edit from the
  pending upload); each of FRONT/THREE_QUARTER/SIDE/FULL_BODY/EXPRESSION = a separate Edit pass with the **portrait
  alone** as image1 and a random seed; frames = Edit with image1 = plate, image2/3 = portraits. No validation of an
  uploaded reference beyond the generic media probe; no identity measurement anywhere.

## 2. Candidates (sources read are listed in §8)

| Candidate | Licence | Size / VRAM (5090) | ComfyUI | Identity evidence | Stylised vs realistic | Verdict |
|---|---|---|---|---|---|---|
| **Qwen-Image-Edit-2511** (installed) | Apache-2.0 | 20.5 GB fp8mixed + 9.4 GB encoder; fits with offload | core, `TextEncodeQwenImageEditPlus`, ≤3 refs | model card: "significantly improved character consistency", multi-person "high-fidelity fusion of two person images", "mitigate image drift", community *viewpoint* and *lighting* LoRAs folded in; no published metric | both (our Cartoon sheets prove stylised; 2512/2511 realism is the model's headline) | **primary** |
| Qwen-Image-2512 (installed) | Apache-2.0 | 20.4 GB fp8 | core | n/a (text-to-image; the seed of identity) | both | keep for the portrait |
| fal **Multiple-Angles LoRA for 2511** | Apache-2.0 | 295 MB | `LoraLoaderModelOnly` (stacks with Lightning in fal's own workflow) | 96 camera poses from 3 000+ Gaussian-splat renders; prompt `<sks> {azimuth} {elevation} {distance}`; strength 0.8–1.0; no identity metric published | trained on renders; works on stylised subjects in community sheets | **first download** (1 min) |
| Qwen-Image-2.1 | Qwen *Research* licence (no commercial grant) | 7B DiT, up to 10 refs, 2K | core (`TextEncodeQwenImage21`, 16 image slots) | "preserve identity for people", six-portrait group photo | both | excluded by licence |
| FLUX.1 Kontext [dev] | FLUX.1 [dev] **Non-Commercial** | 12B bf16 | core | "character consistency without finetuning"; independent paper: Kontext-Direct drifts on large edits | realistic-leaning | excluded by licence |
| OmniGen2 | Apache-2.0 | 7.9 GB fp16 + Qwen2.5-VL-3B; ~17 GB | core (`omnigen2` CLIP type, ReferenceLatent) | authors: in-context generation "sometimes produces objects that differ from the original", "gap compared to GPT-4o" | both, weaker | not worth 8 GB |
| HiDream-O1-Image (May 2026) | MIT | 8B UiT, bf16 shards ≈ 35 GB (fp8/mxfp8 repacks at `Comfy-Org/HiDream-O1-Image`, sizes to confirm) + Gemma-4 E4B encoder | core (`CheckpointLoaderSimple`, `HiDreamO1ReferenceImages`), 50 steps full / 28 dev | "subject-driven personalization", "storyboard generation"; no identity metric; too new for community tests | both claimed | **second-opinion engine later**; not now (≥1.5 h download, unmeasured) |
| HiDream-E1 / E1.1 | MIT (+Llama-3.1 licence on the encoder) | 17B | not core | editing benchmarks only; IMAGE-STACK already found it edits poorly | — | no |
| InstantID | code Apache-2.0, weights "research only", needs insightface antelopev2 (**non-commercial models**) | SDXL | custom packs (cubiq, ZHO), SDXL-era | strong on real faces | realistic only, one face | excluded (licence, SDXL) |
| PuLID-FLUX | Apache-2.0 code, but base FLUX.1-dev (non-commercial) + insightface + EVA-CLIP | FLUX 12B | custom pack (cubiq) | good ID similarity on real faces | realistic | excluded |
| IP-Adapter FaceID (Plus/V2/Portrait) | "research purposes, not intended for commercial use" (insightface) | SD1.5/SDXL | custom pack | moderate | realistic | excluded |
| PhotoMaker V2 | Apache-2.0 | SDXL, 11 GB min | core nodes are **V1 only**; V2 via community | V2 "improved ID fidelity", stylisable | realistic-trained | no (SDXL quality floor, V1-only core) |
| ControlNet for view control: InstantX Qwen-Image-ControlNet-Union (canny/soft-edge/depth/**pose**) | Apache-2.0 | 3.5 GB; `ControlNetLoader`+`ControlNetApplySD3` | native for Qwen-Image base; **on Edit-2511 unverified** | n/a (structure, not identity) | both | optional, after A/B |
| Comfy-Org Qwen DiffSynth patches (canny, depth, inpaint — no pose) | Apache-2.0 | 2.27 GB each; `ModelPatchLoader`+`QwenImageDiffsynthControlnet` | native | n/a | both | not needed |
| SDPose (pose extraction) + RT-DETR | MIT | 1.9 GB + 124 MB | core | n/a | both | only if ControlNet-pose is adopted |
| MediaPipe Face Landmarker (`Comfy-Org/mediapipe`) | Apache-2.0 | **5.4 MB** | core | face presence/count/size/landmarks, blendshapes | detects stylised faces reasonably (BlazeFace), not guaranteed | **download** for reference validation |
| CPU identity check: DINOv2-small (Apache-2.0, 22M) via `@huggingface/transformers`; optional `@vladmandic/human` FaceRes (MIT) | permissive | CPU | worker side (Node) | DINOv2 = style-robust visual similarity, not a face recogniser; FaceRes = real-face embedding, weak on cartoons | see §5 | adopt with honest thresholds |

Excluded on licence alone: everything that depends on insightface models (InstantID, PuLID, IP-Adapter FaceID,
PhotoMaker V2's demo path), FLUX.1 Kontext/dev-based tools, Qwen-Image-2.1. The clean set is Qwen (Apache-2.0) +
Apache/MIT helpers, which is what is installed.

## 3. Identity-drift judgement (files looked at)

`docs/evidence/kite-samir-portrait.png`, `kite-samir-reference-sheet.png`, `kite-amina-reference-sheet.png`
(Cartoon direction, generated 2026-10-02 10:27–10:41 by the current graphs), `kite-frames-sheet.png` (10 shot
frames, plate + 2 portraits), `lamp-shop-export-contact-sheet.png` (export frames of H3 takes conditioned on frames).

- **Samir**: the "portrait" is a full-body hunched figure (the T2I ignored "head-and-shoulders"; the Cartoon
  direction text dominates). Across front / three-quarter / side / full-body the silhouette, grey hair, patchwork
  jacket, pendant and sandals hold. Drift: the **beard** is a full white beard in the portrait and front view, a
  moustache with stubble in the three-quarter, a **moustache only** in the side view; the **patchwork layout and
  colours** of the jacket are re-rolled every view (never the same patches); the side view has a less caricatured,
  younger head; the expression grid shrinks the figure to full-body thumbnails and the bottom-right "surprise" face
  is a different, wider face. Head-to-body ratio changes between views.
- **Amina**: face (big amber eyes, freckles, frown), black braids, olive tee and denim overalls hold well. Drift:
  **shoes** change colour every view (grey, grey/white, white, white/grey), the **rips** in the overalls move, the red
  string bracelets change wrist and count, the **kite** (a prop from the portrait) appears or vanishes; the expression
  sheet repeats the portrait's **sitting pose with the kite** in all four cells instead of neutral faces — the
  portrait's pose leaks into every derived view because the portrait is the only reference.
- **Frames (kite)**: both characters are recognisable in all 10 frames (the sheet pipeline clearly beats prompt-only
  continuity in `karrada-generated-cut-contact-sheet.png`), but Samir's beard again toggles between frames, Amina is
  drawn **sitting with the kite string** in 6 of 10 frames whatever the action, and small extra faces appear once.
- **Lamp shop (H3 takes from frames)**: hairstyles and wardrobe silhouettes hold (curly bun + floral blouse + apron;
  black hair + olive jacket + backpack), but the **woman's face changes age and nose** between mid-shots and
  close-ups, the **man's hair** is loose in some shots and tied in others, the apron and his fingerless gloves come and
  go. Part of this is the video model, but the frames it was given already differed.

Pattern: identity *shape* survives; **secondary identity tokens** (facial hair, accessory details, shoe colour, fabric
pattern, props) are re-sampled per pass because each pass sees one reference, a free seed and a prompt that names
nothing specific. The fix is composition of references, not a new model.

## 4. Recommended pipeline

### 4.1 Primary — no new weights (Edit-2511 + 2512, installed)

Principle: generate the views **jointly** once (one image, one seed, one wardrobe), then derive everything else from
that sheet plus a face crop, with explicit, repeatable wardrobe tokens.

**Step A — Portrait (T2I, 2512)** as now, but the prompt must win over the direction text: put the view sentence
*first* ("Head-and-shoulders portrait, centred, looking at camera, neutral expression, plain mid-grey background,
no props"), then direction + description. Record the seed on the asset (already in provenance) and reuse it (§4.3).
From an uploaded reference: Edit-2511 with image1 = the upload, image2 = a face crop of the upload (§4.4).

**Step B — Canonical identity sheet (one Edit-2511 pass, new `qwenIdentitySheet` graph)**: image1 = portrait,
image2 = face crop of the portrait (`ImageCrop` of the MediaPipe bbox, or the centre-top 55 % square until the
detector is installed). Output 1664×1216 (16-multiple, ≈2 MP; 2511 edits at ~1 MP per reference but outputs larger
fine), prompt: "Character turnaround reference sheet of the same person, four full-body views side by side on one
plain mid-grey background: front view, three-quarter view (turned 45° to the left), exact left profile, back view.
Identical face, hair, skin, build and the exact same outfit in every view: {wardrobe tokens}. Standing, arms relaxed,
neutral expression, even studio light, no text, no labels." Use the 2511-native viewpoint phrasing; with the fal
LoRA (§4.2) the sheet becomes four explicit `<sks>` passes instead. Because the four figures are drawn in one
denoising, patch layouts, beards and shoes agree. Then `ImageCrop` the sheet into FRONT / THREE_QUARTER / SIDE / BACK
tiles (equal quarters; the SDPose or MediaPipe bbox can refine the cut later) and store each as a `CharacterRef`.
Steps: for this one canonical picture spend quality — run **without** the Lightning LoRA at 20–28 steps, cfg 4.0 (the
model card's `true_cfg_scale` 4.0; in ComfyUI that is `KSampler cfg` with the negative encoded through the same
Plus node), expected 1.5–3 min (estimate from the 4-step timings; measure). Lightning 4-step stays for drafts.

**Step C — Derived views, each an Edit-2511 pass with three references in a fixed order**: image1 = the FRONT tile
(neutral standing pose, so no pose leaks), image2 = face crop, image3 = the full sheet (wardrobe truth). Prompt
pattern: "The person in image 1 (face exactly as image 2, outfit exactly as image 3): {view}. {wardrobe tokens}.
Plain mid-grey background." Views: FULL_BODY (832×1472), FACE (1024×1024 tight), EXPRESSION (2×2 grid "the same face
four times, neutral head-and-shoulders, joy / worry / anger / surprise" — from the face crop as image1 so no body
pose), OUTFIT (full body, "complete wardrobe in detail"). Resolution rule: keep every reference ≥ 1 MP on the long
side 1328 (the current `ImageScaleToTotalPixels 1.0` is right); never pass a <512 px crop — upscale the face crop to
1024² with lanczos first.

**Step D — Shot frames**: image1 = plate (as now), image2 = character A **FRONT tile** (not the portrait, which may
carry a pose/prop), image3 = character B FRONT tile; when only one character is in the shot, image3 = that
character's face crop. The prompt says "image 2 is the person described as …, keep face, hair and outfit exactly"
(already done) and adds the wardrobe tokens for each person. Props that belong to the story go in the action
sentence, never in the identity description.

**Wardrobe / identity tokens** (`src/server/story/prompts.ts`): extend `describeCharacter` with a short fixed
"identity line" written once at casting and reused verbatim in every prompt: facial hair state, exact shoe colour,
accessory list, hair length/tie, fabric pattern ("patchwork jacket of brown, teal, ochre and brick squares"). Today
`c.wardrobe`, `distinguishing` and `canon.accessories` exist; the drift shows they are too loose (nothing says "no
beard" or "grey sneakers"). The story engine should be asked to fill `canon.identityLine` at character creation.

**Seed policy**: one `identitySeed` per character stored on the record (`seed32`), used for the sheet and every
derived view and frame; regeneration of a single view bumps a per-view offset. A fixed seed does not guarantee
identity with different prompts, but it removes one source of variance and makes A/B comparable.

### 4.2 What a download adds (sequenced on the ~5 MB/s link; pause the model fetcher during image builds)

| File | Size | Time | Licence | Gain |
|---|---|---|---|---|
| `Comfy-Org/mediapipe` → `detection/mediapipe_face_fp32.safetensors` | 5.4 MB | seconds | Apache-2.0 | reference validation + face crops + per-view face bbox (§4.4) |
| `fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA` → `loras/qwen-image-edit-2511-multiple-angles-lora.safetensors` | 295 MB | ~1 min | Apache-2.0 | deterministic camera control: 8 azimuths × 4 elevations × 3 distances, `<sks> left side eye-level shot wide shot`; replaces fuzzy "turned 45°" prose; fal's own graph stacks it with the Lightning LoRA (both strength 1.0, shift 3.1, 4 steps) |
| `Comfy-Org/SDPose` checkpoint + RT-DETR fp16 | 1.92 GB + 124 MB | ~7 min | MIT | pose keypoints per view → verify a view really is profile/three-quarter (yaw from shoulder/nose geometry) and feed a pose ControlNet |
| `Comfy-Org/Qwen-Image-InstantX-ControlNets` Union | 3.5 GB | ~12 min | Apache-2.0 | pose/depth-locked views; proven on Qwen-Image base, **must be A/B-tested on Edit-2511** before adoption |
| `Comfy-Org/HiDream-O1-Image` fp8 + Gemma-4 encoder | ≈ 15–20 GB (confirm) | ≥ 1 h | MIT | an independent second generator with native multi-subject personalisation; evaluate only after the Qwen path is measured |

Fallback engine: **Qwen-Image-Edit-2511 without Lightning** (quality mode) is the fallback for identity-critical
pictures; HiDream-O1-Image is the only licence-clean *different* model worth a later trial. No FLUX/insightface path.

### 4.3 Concrete graph changes (`src/server/workflows/qwen-image.ts`)

1. `qwenEdit`: add `quality?: boolean` (skip node 4, `steps ?? 24`, `cfg ?? 4.0`), `extraLoras?: {name, strength}[]`
   (chain `LoraLoaderModelOnly` after node 4; the Multiple-Angles LoRA when present in `/models/loras`), `seed`
   mandatory from the character's `identitySeed`. Keep `TextEncodeQwenImageEditPlus` for both positive and negative
   (negative text matters only in quality mode; with cfg 1 it is inert — `prompts.ts` already notes this).
2. New `qwenIdentitySheet(i: {portrait, faceCrop?, prompt, seed, quality})`: nodes `img1` LoadImage(portrait) →
   `ImageScaleToTotalPixels 1.0`; `img2` = face crop: if `faceCrop` given, LoadImage; else `ImageCrop` of `img1` at
   (x = 22 %, y = 0, w = 56 %, h = 45 % of the portrait, computed server-side from the probe size) → `ImageScale` to
   1024×1024 lanczos; `TextEncodeQwenImageEditPlus(image1, image2)`; `EmptySD3LatentImage 1664×1216`; KSampler;
   `VAEDecode`; **four `ImageCrop` nodes** (x = k·416, y = 0, 416×1216) each to its own `SaveImage` with prefixes
   `vewbox/sheet-front|threequarter|side|back`, plus one `SaveImage` of the whole sheet. `comfy.firstOutput` must
   become `outputsByPrefix` so the handler receives all five files from one run.
3. New `qwenView(i: {front, face, sheet, view, size, seed, angleLora?})`: three LoadImage → scale → Plus encode;
   with the LoRA the prompt is `<sks> {azimuth} {elevation} {distance}. ` + identity line; without it the prose view
   from `characterPrompt`. Views map: FRONT = `front eye-level medium shot`, THREE_QUARTER = `front-left quarter
   eye-level medium shot`, SIDE = `left side eye-level medium shot`, BACK = `back eye-level medium shot`, FULL_BODY
   = `front eye-level wide shot`.
4. `drawShotFrame`: pass FRONT tiles (fallback portrait) as image2/3; add the identity lines to the guidance.
5. Validation graph (after the 5.4 MB download) `faceCheck(image)`: LoadImage → LoadMediaPipeFaceLandmarker
   (`mediapipe_face_fp32.safetensors`) → MediaPipeFaceLandmarker(detector_variant `both`, num_faces 5, min_confidence
   0.5) → MediaPipeFaceMask → MaskToImage → SaveImage. Core ComfyUI has no JSON output node, so the worker reads the
   mask PNG with `sharp`: connected components = face count, bbox = largest component, area ratio = face size. (If a
   Node-side detector is preferred, `@vladmandic/human` MIT does detection + bbox on CPU without ComfyUI; pick one.)
6. `scripts/check-comfy-nodes.mjs`: add `ImageCrop`, `ImageScale`, `LoadMediaPipeFaceLandmarker`,
   `MediaPipeFaceLandmarker`, `MediaPipeFaceMask`, `MaskToImage` and the new LoRA/detection files to `want`.

### 4.4 Uploaded-reference validation (before the portrait job is queued)

Checks, in order, with the reason surfaced to the Character page: (1) decodable image, ≥ 768 px on the short side,
≤ 24 MP (sharp metadata; the existing probe); (2) sharpness: `sharp(...).stats().sharpness` above a floor learnt from
the accepted portraits (reject obvious blur); (3) **exactly one face** with bbox height ≥ 18 % of the image height
(MediaPipe graph or Human); zero faces → "no face found — use a clearer picture", several → "one person only";
(4) face not cut by the border (bbox margin ≥ 2 %); (5) store the face bbox on the asset so Step A/B can crop
without a second detection. Outcome fields: `{ok, faces, faceBox, shortSide, sharpness, reasons[]}` persisted on the
`pendingReference` and shown by the frontend.

### 4.5 Objective identity check (with limits)

- **Metric 1 — DINOv2-small cosine on face crops** (Apache-2.0, 22 M params, `@huggingface/transformers`
  `image-feature-extraction` with `Xenova/dinov2-small`, CPU, ~50 ms/crop): compare each derived view's face crop with
  the canonical face crop. Style-robust (works on Cartoon/Anime), but it measures visual similarity, not identity: a
  different person in the same style can score high, and a profile versus a front face scores lower by construction.
  Use per-view baselines: FRONT ≥ 0.80, THREE_QUARTER ≥ 0.70, SIDE ≥ 0.60, expressions ≥ 0.70 — provisional numbers
  to be calibrated on the Kite and Lamp-shop sets (log first, gate later).
- **Metric 2 (realistic direction only) — FaceRes embedding from `@vladmandic/human`** (MIT): a real-face recogniser;
  meaningful for REALISTIC characters (same-person threshold ≈ 0.5 similarity in Human's scale), unreliable for
  Cartoon/Anime. insightface/antelopev2 is more accurate but its models are non-commercial — not used.
- **Metric 3 — wardrobe tokens**: the image-to-text route is not available locally without another model; instead
  compare dominant-colour histograms (sharp `stats`) of the torso and feet regions between the sheet and each view;
  a shoe-colour flip (Amina) is caught cheaply. Honest limit: colour only, no pattern semantics.
- Record all scores in the asset provenance and in the Casting→Preproduction handoff `validation.checks`
  (`identity-similarity` per view); auto-retry a view once with seed+1 when below the floor; never auto-reject a
  stylised character on Metric 2.

## 5. Implementation plan

Backend (Agent 5 + Backend agent):
1. `prompts.ts`: `identityLine(c)`; portrait prompt reordered (view first); `characterPrompt` gains `BACK`-aware
   LoRA phrases. Tests: snapshot the prompts for the two Kite characters.
2. `qwen-image.ts`: `qwenIdentitySheet`, `qwenView`, `qwenEdit{quality, extraLoras}`, `faceCheck`; `workflowVersion`
   hashes stay automatic; `comfy.ts`: `outputsByPrefix`.
3. `images.ts`: `characterRefs` → sheet pass then derived views; store `sheetAssetId`, `identitySeed`, face bbox,
   per-view scores; `drawShotFrame` uses FRONT tiles; new job `CHARACTER_REFERENCE_CHECK` run on upload.
4. Domain: `Character.canon.identityLine`, `Character.identitySeed`, `PendingReference.check`; `CharacterRef.score`.
   Appearance lock rules unchanged (`docs/CHARACTER-CONTINUITY.md`).
5. Manifest: add the mediapipe file (5.4 MB) and the fal LoRA (295 MB) with sha256 from the HF LFS listing; registry
   rows + `check-comfy-nodes.mjs`. SDPose / ControlNet-Union only after an A/B on Edit-2511 (two characters × 5 views,
   Metric 1 before/after).
6. Measure and write to `docs/MODELS.md` VRAM table: sheet pass (quality mode) seconds and peak VRAM; derived view
   seconds with three references.

Frontend: reference drop zone shows the validation result (faces found, size, sharpness, the reason when refused);
the Appearance tab shows the identity sheet as one picture with the four tiles, each view with its score badge and a
"Redraw this view" action (seed offset), and the identity line as an editable field that is locked with the rest
of the appearance once the character is used.

Acceptance: re-draw Samir and Amina; the beard state, patch layout and shoe colour must agree across all views
(visual check + Metric 1 ≥ floors); ten Kite frames re-drawn from FRONT tiles must show Amina standing when the
action says so.

## 6. Sources read

Qwen-Image-Edit-2511 model card https://huggingface.co/Qwen/Qwen-Image-Edit-2511 and release page
https://docs.qwenlm.ai/qwen-image-edit-2511/index.html; Qwen-Image-2512 https://huggingface.co/Qwen/Qwen-Image-2512;
Qwen-Image-2.1 https://huggingface.co/Qwen/Qwen-Image-2.1; Lightning LoRA
https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning; multi-angle LoRA README and bundled ComfyUI workflow
https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA; FLUX.1 Kontext dev
https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev; OmniGen2 https://github.com/VectorSpaceLab/OmniGen2 and
https://docs.comfy.org/tutorials/image/omnigen/omnigen2; HiDream-E1 https://huggingface.co/HiDream-ai/HiDream-E1-Full;
HiDream-O1 https://docs.comfy.org/tutorials/image/hidream/hidream-o1 and
https://comfyui-wiki.com/en/models/hidream/hidream-o1-image; InstantID https://github.com/instantX-research/InstantID;
PuLID https://github.com/ToTheBeginning/PuLID; IP-Adapter FaceID https://huggingface.co/h94/IP-Adapter-FaceID;
PhotoMaker https://github.com/TencentARC/PhotoMaker and https://huggingface.co/TencentARC/PhotoMaker-V2; insightface
model licence https://github.com/deepinsight/insightface/tree/master/python-package; Qwen ControlNets
https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union, https://huggingface.co/Comfy-Org/Qwen-Image-DiffSynth-ControlNets,
Comfy-Org/Qwen-Image-InstantX-ControlNets file listing; SDPose https://huggingface.co/Comfy-Org/SDPose and ComfyUI
`comfy_extras/nodes_sdpose.py` (v0.38.1); MediaPipe https://docs.comfy.org/tutorials/utility/face-detection/mediapipe,
https://huggingface.co/Comfy-Org/mediapipe, `comfy_extras/nodes_mediapipe.py`; DINOv2
https://huggingface.co/facebook/dinov2-small, https://huggingface.co/Xenova/dinov2-small; Human
https://github.com/vladmandic/human; facenet-pytorch https://github.com/timesler/facenet-pytorch (MIT code; weights
derive from VGGFace2 — not chosen); community: UMO on Qwen Edit
https://insiders.dashtoon.com/no-more-face-mashups-umo-meets-qwen-edit/ (multi-identity mixing still a research
topic), the-decoder / hackernoon 2511 write-ups (promotional, no measurements).
