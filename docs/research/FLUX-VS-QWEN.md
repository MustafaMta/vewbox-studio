# FLUX vs Qwen for the canonical character image (research + GPU A/B, 2026-10-03)

Question (directive Part 5): is FLUX more suitable than the shipping Qwen image stack for **one canonical front
full-body image per character** — head to feet, neutral pose, clean background, correct style (Cartoon = 3D feature
animation, Anime = premium 2D, Realistic = photograph) — drawn from text (Auto/Manual) or from an uploaded picture
(Image Reference)? Decide with evidence; do not replace Qwen because FLUX is newer; do not keep two competing
pipelines without a reason.

Method: desk research (licences quoted from the LICENSE files / model cards, ComfyUI 0.38.1 node support read from the
running server and its source, public arena numbers), then a GPU A/B straight through ComfyUI on the RTX 5090 with the
six characters, seeds, prompts and three stand-in uploads of `tools/canonical-image-gpu.ts`
(`docs/evidence/image-v2/REPORT.md`), two seeds each. Driver: `tools/flux-vs-qwen-gpu.ts`; identity metrics:
`tools/flux-vs-qwen-identity.py`; evidence: `docs/evidence/flux-vs-qwen/`. **The shipping pipeline was not changed.**
The three tools named here (`tools/canonical-image-gpu.ts`, `tools/flux-vs-qwen-gpu.ts`, `tools/flux-vs-qwen-identity.py`)
were removed 2026-10-06 (the A/B is decided, §0); recoverable from git history at `df74b50c`.

## 0. Decision in one paragraph

**Keep Qwen-Image-2512 for Auto/Manual. Move the Image Reference canonical image from Qwen-Image-Edit-2511 to
FLUX.2 [klein] 4B (distilled, Apache-2.0), with a FLUX-specific prompt. Do not adopt klein Base, klein 9B, FLUX.2
[dev] or any FLUX.1 model.** From text, Qwen-Image-2512 drew the best pictures (finish 4.75 vs 4.25 of 5), kept the
written garments (klein turned coveralls into bib overalls and overalls into shorts) and placed one-sided details
better with today's wording (17/26 vs 9/26). FLUX.2 [klein] 4B is 24× faster (1.8 s vs 42 s) but that is not our
bottleneck. From an uploaded picture, which is usually a head-and-shoulders or waist-up photo, Qwen-Image-Edit-2511
keeps the upload's crop. It drew a whole figure in only 17 of 24 redraws (7 of 12 with the face crop the shipping
handler sends first), and on one upload the shipping retry also failed. klein 4B drew a whole figure in 24 of 24, with
no invented attributes once the prompt no longer listed "glasses", eye-rated likeness 3.71 vs 3.50, every realistic
redraw well above the face-match threshold (SFace 0.62–0.85; Qwen's whole-figure redraws 0.82–0.84), better likeness
for photo-to-cartoon, 3.7 s instead of 102 s and about 9 GB less VRAM. This is a small, justified combination: one
engine per creation mode, with nothing competing inside a mode. Edit-2511 stays for the secondary material (sheets,
views, shot frames), which this study did not test. The switch is **not made here**: §6 is the integration plan and its
acceptance gate.

| | Qwen (shipping) | FLUX.2 klein 4B distilled | klein 4B Base | verdict |
|---|---|---|---|---|
| **Text → image** (6 characters × 2 seeds) | **0/12 failures, finish 4.75, tokens 106/110, one-sided 17/26, 41.9 s, card 30.9 GB** | 0/12, 4.25, 108/110 (but overalls → shorts, coveralls → bib overalls), 9/26 (17/26 with picture-side wording), **1.8 s, 21.9 GB** | 3/12 (feet at the edge), 3.5, 10/26, 28.8 s | **keep Qwen-Image-2512** |
| **Image Reference** (6 uploads × with/without face crop × 2 seeds) | 8/24 failures (7 not whole figure, 1 invented hair), whole figure 17/24, likeness 3.50, 101.9 s / 66.3 s | **0/24 failures** with the FLUX prompt (8/12 with the shipping prompt: glasses invented), **whole figure 24/24, likeness 3.71, 3.7 s / 2.5 s, 22.6 GB** | original 3 uploads only: 7/12 failures (shipping prompt), 1/12 (FLUX prompt); likeness 2.4–2.7; 80.6 s / 52.4 s | **switch to klein 4B distilled** (plan §6) |

## 1. Candidates, licences and commercial use (verified 2026-10-03)

"Commercial" below means: may the weights be **run inside a paid product whose output reaches end users** (Vewbox).
All FLUX "Non-Commercial" licences let you use the *outputs* commercially but forbid running the *model* for a
commercial purpose, so they are excluded for a product the same way.

| Model (release) | Licence, as written | Commercial use of the model | Verdict |
|---|---|---|---|
| **FLUX.2 [klein] 4B** distilled and **4B Base** (2026-01-15) | model card `license: apache-2.0`; flux2 README: "Apache-2.0: … 4B Klein models and the FLUX.2 autoencoder"; Comfy-Org/flux2-klein-4B repo `apache-2.0` (text encoder Qwen3-4B, Apache-2.0) | **yes** | **tested** (the only commercially usable FLUX.2 weights) |
| FLUX.2 [klein] 9B / 9B Base / 9B KV (2026-01-15, KV 2026-03-09) | "FLUX Non-Commercial License v2.1" (`model_licenses/LICENSE-FLUX-NON-COMMERICAL`): Non-Commercial Purpose excludes use "(a) for revenue-generating activity, (b) in direct interactions with or that has impact on end users"; "If you want to use a FLUX Model … for any purpose that is not expressly authorized under this License, such as for a commercial activity, you must request a license from Company." | no (paid BFL self-hosted licence, "Builder" tier covers klein, price on request) | excluded |
| FLUX.2 [dev] 32B (2025-11-25) | "FLUX [dev] Non-Commercial License v2.0" (`LICENSE-FLUX-DEV`, names FLUX.1 [dev], Fill, Depth, Canny, Redux, Kontext [dev], Krea [dev] and FLUX.2 [dev]); same non-commercial definition | no (paid "Platform"/"Professional" licence) | excluded; also 35.5 GB fp8 DiT + 24B Mistral encoder does not fit 32 GB without offload |
| FLUX.1 [dev], Kontext [dev], Krea [dev], Fill/Redux/Canny/Depth (2024–25) | "FLUX.1 [dev] Non-Commercial License v1.1.1": licence "solely for your Non-Commercial Purposes" | no | excluded (also excludes USO/UNO/PuLID/DreamO/ACE++ built on them) |
| FLUX.1 [schnell] 12B (2024-08) | Apache-2.0: "can be used for personal, scientific, and commercial purposes" | yes | **not downloaded**: text-to-image only (no reference input, so Image Reference would still need Qwen-Edit = two pipelines), T5 prompt limit 256 tokens (our canonical prompts are longer), lowest arena score of the family (AA T2I v2.0 Elo 803 vs klein 4B 863, FLUX.1 [dev] 841); 17.2 GB fp8 checkpoint. Not plausibly better. |
| FLUX 3 (2026-07-23) / FLUX 3 Dev | proprietary API; open-weight "FLUX 3 Dev" announced, **no weights, no licence published** (BFL HF org lists only `flux-3-action-*` robotics models, 2026-09-22) | — | not available |
| FLUX.2 small decoder (2026-04-06) | VAE decoder only (faster decode) | — | not a generator; not needed |
| **Qwen-Image-2512** (2025-12-31) | `license: apache-2.0`; README "Qwen-Image is licensed under Apache 2.0." (LICENSE: Apache 2.0, "Copyright 2024 Alibaba Cloud") | **yes** | **shipping** (Auto/Manual) |
| **Qwen-Image-Edit-2511** (2025-12-23) | same Apache-2.0 | **yes** | **shipping** (Image Reference) |
| Qwen-Image-Edit-2509 / -Edit / Qwen-Image (2025) | Apache-2.0 | yes | superseded by 2511 / 2512 |
| Qwen-Image-Layered (2025-12-19) | Apache-2.0 | yes | RGBA layer decomposition, not a character generator |
| Qwen-Image-2.1 (2026-09-20) | "Qwen RESEARCH LICENSE AGREEMENT": "'Non-Commercial' shall mean for research or evaluation purposes only"; "You shall not use the Materials for any commercial purpose without obtaining a separate commercial license from us" (model-business@notice.qwencloud.com) | no (separate licence) | excluded |
| Qwen-Image-2.0 / 3.0 | API only, no weights | — | out of scope (local) |

Sources: github.com/black-forest-labs/flux2 (README table, `model_licenses/`), github.com/black-forest-labs/flux
(README, `model_licenses/LICENSE-FLUX1-dev`, `LICENSE-FLUX1-schnell`), huggingface.co/black-forest-labs/FLUX.2-klein-4B,
-klein-base-4B, FLUX.1-schnell, bfl.ai/licensing, huggingface.co/api/models?author=black-forest-labs,
github.com/QwenLM/Qwen-Image (README news + LICENSE), huggingface.co/Qwen/Qwen-Image-2512, Qwen-Image-Edit-2511,
github.com/QwenLM/Qwen-Image-2.1 (LICENSE), huggingface.co/api/models?author=Qwen&search=Qwen-Image,
github.com/huggingface/diffusers releases (Flux2KleinPipeline in 0.37; QwenImage21Pipeline; JoyAI-Image-Edit-Plus in
0.40 — diffusers is not our runtime, it only confirms the model families are mainstream).

## 2. Engine support, size, speed, reference capability

| | FLUX.2 [klein] 4B distilled | FLUX.2 [klein] 4B Base | Qwen-Image-2512 | Qwen-Image-Edit-2511 |
|---|---|---|---|---|
| ComfyUI 0.38.1 | **core**: `CLIPLoader type flux2` (Qwen3-4B, layers 9/18/27, chat template, no prompt truncation, padded to 512), `Flux2Scheduler`, `EmptyFlux2LatentImage`, `ReferenceLatent`, `CFGGuider`, `SamplerCustomAdvanced`; Comfy-Org templates `image_flux2_klein_*` | same | core (shipping) | core (shipping), `TextEncodeQwenImageEditPlus` image1..3 |
| Weights (ComfyUI files) | DiT bf16 7.75 GB + Qwen3-4B 8.04 GB + VAE 0.34 GB | DiT bf16 7.75 GB (shares encoder/VAE) | fp8 20.4 GB + Qwen2.5-VL-7B fp8 9.4 GB + VAE 0.25 GB | fp8mixed 20.5 GB (shares encoder/VAE) |
| Sampling | 4 steps, cfg 1 (no negative) | BFL: 50 steps, guidance 4 (Comfy template 20 steps, cfg 5); negative works through CFG | shipping: 30 steps, cfg 4 + negative | shipping: 24 steps, cfg 4 + negative |
| Reference input | multi-reference (reference latents appended to the sequence) | same | none | 1–3 pictures in core |
| Vendor speed/VRAM claim | ~1.2 s, 8.4 GB (Comfy docs), "fits ~13 GB" (BFL) | ~17 s, 9.2 GB (Comfy docs) | — | — |
| Public arenas (secondary) | AA T2I v2.0 Elo 863; AA Image-Editing Elo 947 | AA editing (9B Base) 972; 4B Base not listed | listed above klein 9B on AA T2I (“klein 9B … trailing FLUX.2 [dev] Turbo and Qwen Image 2512”) | AA Image-Editing Elo 1022 (vs klein 4B 947, FLUX.1 Kontext [dev] 855) |
| Community reports | "Klein 4B struggles to preserve the pose fully" (daslikes.wordpress.com, 2026-03-06, QIE vs klein); "4B has very weak consistency" (news.hada.io) | — | — | "QIE wins by keeping pose intact and applying all wanted edits" (same source) |

Arena and community numbers are secondary and from different snapshots; they set expectations only. The A/B below
decides.

## 3. GPU A/B — setup

- **Hardware/engine:** RTX 5090 32 GB, ComfyUI 0.38.1 (`vewbox-comfyui-1`), every graph from core nodes. Before each run
  the voice/ASR/voice-design services were unloaded (`POST /unload` on :8020/:8021/:8030/:8022) and the harness waited
  for zero active studio jobs and an empty ComfyUI queue. Before each arm, `POST /free`: the first picture of an arm is
  "cold" (model load), the rest are "warm". No other client's prompt ran inside any recorded picture (`interleaved` is
  empty in every record). VRAM = **whole card** (`nvidia-smi`, sampled every 200 ms), including 2.6–3.1 GB that the
  unloaded services' CUDA contexts and the desktop keep.
- **Frame:** the canonical 928×1664 for every arm.
- **Text set:** the six characters, identity lines and seeds of `tools/canonical-image-gpu.ts` (2 per style; each has
  2–3 one-sided details), shipping prompt `canonicalPrompt` + `negativeFor`, seeds s and s+1.
- **Reference set:** the three stand-in uploads of the image-v2 run (IR1 photo head shot → Cartoon, IR2 photo bust →
  Realistic, IR3 anime drawing → Anime) with the identity lines Qwen3.5-4B wrote for them then (frozen), plus three
  more stand-ins drawn for this study because IR2, the only bust photo, was where Edit-2511 had failed: IX1 bust photo →
  Realistic, IX2 waist-up photo → Cartoon, IX3 bust photo → Anime. These were read exactly as the worker reads an upload
  (MediaPipe face box + Qwen3.5-4B description → identity line). All six are generated pictures, not real people. Each
  upload was redrawn with the face crop (shipping attempt 1) and without it (the shipping retry), seeds 970007/970008.
- **Arms:** `QWEN` = shipping (2512: 30 steps, cfg 4; Edit-2511: 24 steps, cfg 4, image1 upload, image2 face crop).
  `K4D` = klein 4B distilled, 4 steps, cfg 1, Comfy-Org template wiring (`Flux2Scheduler`, `EmptyFlux2LatentImage`,
  euler, `CFGGuider`, `ConditioningZeroOut` negative; each reference → `VAEEncode` → `ReferenceLatent`, upload at 1 MP,
  face crop 1024²). `K4B` = klein 4B Base, 50 steps, cfg 4 (BFL's reference settings) with the shipping negative.
  `-T` = the same graph with a FLUX-style prompt (BFL guide: no negative prompts, word order matters; the medium and
  framing without "not a photograph" / "no props, no text", no avoid sentence, and the reference sentence without the
  generic "facial hair, glasses" list). `-S` = the shipping text prompt with "his/her own left/right" rewritten in
  picture space ("the picture's right-hand wrist"), run for QWEN and K4D.
- **Measures:** framing by `src/server/media/figure-check.ts` (unchanged rules); my own look at every picture at full
  resolution (finish 1–5, medium ok/partial/wrong, whole figure, anatomy, identity tokens present, one-sided details on
  the right side, reference likeness 1–5 from 256² face crops); identity metrics on the CPU with the licence-clean
  models already on the volume (SFace cosine, OpenCV threshold 0.363; DINOv2-small face-crop cosine; CCIP for
  anime→anime only, because across media it called a photo of a woman and an anime man "the same").
  **Failure** = generation error, framing check failed, not a whole figure by eye, wrong medium, major anatomy error or
  an invented attribute.

## 4. Results — from text (Auto / Manual)

| Arm | Framing | Medium right (C / A / R) | Finish | Tokens | One-sided | Failures | Engine warm / cold | Card peak |
|---|---|---|---|---|---|---|---|---|
| **QWEN** (shipping) | 12/12 | 4/4 · 2/4 · 4/4 | **4.75** | 106/110 | **17/26** | 0/12 | 41.9 s / 61.0 s | 30.9 GB |
| QWEN-S (picture-side wording) | 12/12 | 4/4 · 2/4 · 4/4 | 4.75 | 106/110 | 18/26 | 0/12 | 42.0 s / 55.4 s | 31.6 GB |
| K4D | 12/12 | 4/4 · **4/4** · 4/4 | 4.25 | 108/110 | 9/26 | 0/12 | **1.8 s** / 9.2 s | 21.9 GB |
| K4D-T (FLUX prompt) | 12/12 | 4/4 · 4/4 · 4/4 | 4.25 | 108/110 | 8/26 | 0/12 | 1.6 s / 10.7 s | 21.8 GB |
| K4D-S (picture-side wording) | 12/12 | 4/4 · 4/4 · 4/4 | 4.25 | 108/110 | 17/26 | 0/12 | 1.6 s / 7.4 s | 22.5 GB |
| K4B (Base) | 9/12 | 4/4 · 4/4 · 4/4 | 3.5 | 109/110 | 10/26 | 3/12 | 28.8 s / 37.8 s | 22.5 GB |
| K4B-T | 10/12 | 4/4 · 4/4 · 4/4 | 3.5 | 109/110 | 11/26 | 2/12 | 28.9 s / 36.0 s | 22.5 GB |

What the numbers do not show (all pictures in `text-*.jpg`):
- **Cartoon.** Qwen's kite-maker has a true patchwork of large squares and the girl wears full-length overalls torn at
  the knee; klein turned the patchwork into a small-check plaid and the overalls into short overalls (4/4). Qwen's renders
  have more appeal; klein's are clean but stiffer. klein Base looks like a vinyl toy (orange skin, long necks, chibi heads).
- **Anime.** klein's two anime characters are clean flat cel anime. Qwen's student is clean anime, but its courier is a
  western-comic rendering with gradients and heavy outlines (2/2, marked "partial"). This is klein's one stylistic win.
- **Realistic.** Both are convincing photographs. Qwen's mechanic is too light-skinned (2/2); klein's wears bib
  overalls instead of coveralls (4/4 in K4D/K4D-T).
- **Freckles.** Qwen did not show them (2/2); klein did. This is the only token klein drew and Qwen missed.
- **One-sided details.** With today's identity wording ("on her own right wrist"), klein draws most of them on the
  picture's side of that name, i.e. mirrored (9/26, below chance). Written in picture space it reaches 17/26, the same as
  Qwen. Qwen gains nothing from that wording (17 → 18). Both models put the kite-maker's elbow patch, the pharmacist's
  badge and the mechanic's rag on the wrong side whatever the wording.
- **Anatomy.** No major errors in any arm. klein Base had three minor proportion faults.

**Verdict, text:** Qwen-Image-2512 stays. klein's 24× speed and cleaner anime (one character) do not outweigh the
finish and the garment fidelity, and its one-sided details only match Qwen's after a wording change.

## 5. Results — from an uploaded picture (Image Reference)

| Arm (pictures) | Whole figure (check / eye) | Failures | Upload attributes kept | Invented | Likeness (eye) | SFace, realistic targets | Engine warm, face crop / upload only | Card peak |
|---|---|---|---|---|---|---|---|---|
| **QWEN**, original 3 (12) | 9/12 · 9/12 | 3/12 | 70/80 | 0 | 3.42 | 0.83–0.89 (whole figure: 0.838, 1 picture) | 101.9 s / 66.3 s (cold 122 s) | 31.7 GB |
| **QWEN**, extra 3 (12) | 8/12 · 9/12 | 5/12 | 66/72 | 1 (hair on a shaved head) | 3.58 | 0.82–0.92 (whole figure: 0.839, 0.822) | 101.7 s / 66.3 s | 31.7 GB |
| K4D, shipping prompt (12) | 12/12 · 12/12 | 8/12 | 64/80 | **8** (glasses on IR2 and IR3) | 2.92 | 0.68–0.74 | 3.7 s / 2.5 s | 21.9 GB |
| **K4D-T**, original 3 (12) | **12/12 · 12/12** | **0/12** | 72/80 | 0 | 3.58 | 0.78–0.85 (all whole figure) | **3.7 s / 2.5 s** (cold 11 s) | 21.9 GB |
| **K4D-T**, extra 3 (12) | **12/12 · 12/12** | **0/12** | 68/72 | 0 | 3.83 | 0.62–0.79 (all whole figure) | 3.7 s / 2.5 s | 22.6 GB |
| K4B / K4B-T, original 3 (12 each) | 9/12 / 11/12 | 7/12 / 1/12 | 61 / 66 of 80 | 5 / 0 | 2.42 / 2.67 | 0.59–0.78 | 80.6 s / 52.4 s | 22.5 GB |

- **Framing is the deciding difference.** Edit-2511 keeps the upload's composition. From the bust and waist-up photos
  it drew a waist-up or head-and-shoulders picture in 7 of 16 redraws (IR2 3/4, IX1 2/4, IX2 1/4, IX3 1/4 by the framing
  check). Over all six uploads, the face-crop redraw (the shipping first attempt) missed the feet in 5 of 12. On IR2 the shipping retry failed too,
  so that character would have been delivered without feet. klein redrew every upload as a whole figure, 24/24, with
  and without the face crop.
- **Likeness.** For photo → Realistic, Qwen's faces are the closest when it draws a whole figure (IX1 face-crop s0:
  near-identical smile and wrinkles). klein's are clearly the same people (SFace ≥ 0.62 on all eight whole-figure
  redraws, threshold 0.363) but calmer and a little more generic. For photo → Cartoon, klein is closer: IR1 SFace 0.27 vs
  0.22 and a mature face where Qwen drew a young big-eyed figure; IX2 SFace 0.25–0.54 vs 0.10–0.26, keeping the curls'
  volume and the freckles where Qwen drew a generic redhead. For anime → Anime (IR3), both are equal (CCIP 0.028 vs
  0.026, same character).
- **Attributes.** klein kept IR3's white star patch 4/4 (Qwen 2/4: yellow, then multicolour) and never added the
  sticker-like outline Qwen drew once. Qwen added hair to IX3's shaved head once. Both drew IX3 (photo → Anime) as a
  western flat cartoon rather than anime (8/8, "partial"); that is a prompt/style matter, not an engine difference.
- **klein reads words literally.** The shipping reference sentence "Keep the face shape, age, skin tone, hair, facial
  hair, glasses and every visible garment…" made klein draw glasses on two people who wear none (8/8). The FLUX prompt
  names only what every picture has, and that removed it completely (0/24). The klein prompt must never name an
  attribute the character does not have, and the acceptance run must count invented attributes.
- **klein Base is not a candidate.** It was 20× slower than distilled, with worse likeness, the feet on the bottom edge,
  and invented glasses with the shipping prompt.

**Verdict, Image Reference:** switch the canonical-from-upload step to klein 4B distilled with the FLUX prompt. Its
gains are whole figure 24/24 vs 17/24, failures 0/24 vs 8/24, likeness equal or better except realistic close
identity, and 27× speed. The cost is one more 16 GB model family on disk and a little realistic face fidelity.

## 6. Integration plan (not implemented — the shipping pipeline is unchanged)

1. **Weights.** In `docker/models/manifest.json`, rename group `eval-flux2-klein-4b` to `images-flux2-klein`. Keep
   `vae/flux2-vae`, `diffusion_models/flux-2-klein-4b` and `text_encoders/qwen_3_4b` (16.1 GB, sha256 in §7), drop the
   Base file and delete it from the volume (7.75 GB). Add the group to the default `MODEL_GROUPS` in `compose.yaml`, and add
   Apache-2.0 rows to `docs/MODELS.md`.
2. **`src/server/workflows/index.ts`** `MODELS`: `kleinDit: 'flux-2-klein-4b.safetensors'`, `kleinTe: 'qwen_3_4b.safetensors'`,
   `kleinVae: 'flux2-vae.safetensors'`.
3. **`src/server/workflows/canonical-image.ts`**:
   - `kleinReferenceCanonical({ upload, faceRect?, prompt, seed, filenamePrefix })` is exactly `kleinGraph` of
     `tools/flux-vs-qwen-gpu.ts` with these nodes:
     - `UNETLoader(kleinDit, default)`, `CLIPLoader(kleinTe, type flux2)`, `VAELoader(kleinVae)`
     - `LoadImage(upload)` → `ImageScaleToTotalPixels(lanczos, 1.0 MP, 16)` → `VAEEncode` → `ReferenceLatent` on the
       positive; then, if `faceRect`: `ImageCrop(faceRect)` → `ImageScale(lanczos, 1024², center)` → `VAEEncode` →
       `ReferenceLatent` (chained after the upload's)
     - `CLIPTextEncode(prompt)`, `ConditioningZeroOut` as the negative
     - `Flux2Scheduler(steps 4, 928, 1664)`, `EmptyFlux2LatentImage(928×1664)`, `RandomNoise(seed32)`, `KSamplerSelect(euler)`,
       `CFGGuider(cfg 1)`, `SamplerCustomAdvanced`, `VAEDecode`, `SaveImage(CANONICAL_OUTPUT)`
   - `kleinReferencePrompt({ style, identityLine, faceImage, character, visual })` is `fluxReferencePrompt`, built in
     this order:
     - the medium noun without negations ("a stylized 3D animated feature-film character (CG render)" / "a 2D anime
       character (cel-shaded illustration with clean line art and flat colours)" / the realistic one unchanged)
     - `CANONICAL_FRAMING` without "no props, no text"
     - "Keep the face, age, skin tone, hair and every visible garment and colour exactly as in the picture; complete what
       the picture does not show from the description"
     - the identity line, `character` and `visual`. No avoid sentence and no negative.
   - Keep `qwenReferenceCanonical` for one release behind `CANONICAL_REFERENCE_ENGINE=qwen` as a rollback, then delete
     it. A rollback window is the only justification for keeping it.
4. **`src/worker/handlers/images.ts`** `characterAppearance`:
   - `graph = read ? kleinReferenceCanonical({ upload: read.upload, faceRect, prompt: kleinReferencePrompt(…), seed: usedSeed }) : qwenCanonicalImage(…)`
   - `CANONICAL_ENGINE.REFERENCE = 'FLUX.2 [klein] 4B (4 steps, cfg 1)'`, `model = 'FLUX.2-klein-4B'`
   - Keep the retry rule as it is (second attempt without the face crop, seed + 1) and the framing check.
   - The read step is unchanged: MediaPipe + Qwen3.5-4B, 9.3 GB, which ComfyUI unloads before klein (card ≈ 22 GB).
5. **`src/server/registry.ts`**: replace `qwen-image.canonical-reference` with `flux2-klein.canonical-reference` (with a
   `faceRect`), so `scripts/check-comfy-nodes.mjs` checks the nodes and the three files.
6. **Tests (vitest)**:
   - the builder: node classes, steps 4, cfg 1, frame 928×1664, references chained upload then face, no negative text
   - the prompt: no "glasses" or "facial hair" unless the identity line has them, no "not a …" / "no …" phrases, medium first
7. **Acceptance before the default flips:**
   - Run `pnpm exec tsx tools/flux-vs-qwen-gpu.ts --arms K4D-T,QWEN --phases extra-prep,extra` with `EXTRA` widened to
     ≥ 10 uploads: head shots, bust and waist-up photos, a full-length photo, two drawings, and a consenting real photo
     if the producer provides one.
   - Gates: whole figure ≥ 95 % by the framing check, zero invented attributes, realistic SFace ≥ 0.6 on every
     whole-figure redraw, eye likeness ≥ Qwen's mean, no medium errors.
8. **Docs:**
   - the engine line in `docs/CONTRACTS-IDENTITY-PACK.md`
   - VRAM in `docs/OPERATIONS.md`: the reference redraw takes the card to ≈ 22 GB, not 31.7 GB
   - this report's decision in `docs/research/CHARACTER-IMAGE-V2.md`
9. **Not part of the switch (follow-ups):**
   - If klein is ever used from text, the identity line must state one-sided details in picture space (`toPictureSides`
     in the tool). Qwen does not need it.
   - Photo → Anime came out as a western flat cartoon in both engines. That is a style-prompt issue to fix separately.

## 7. Downloads (fetched with the manifest fetcher, sha256-verified; ~23.9 GB at 1–4 MB/s)

All four files are from `Comfy-Org/flux2-klein-4B` @ `5f526678002e43af5551dadb73ce2e8c91b43afe` (repo licence
`apache-2.0`), group `eval-flux2-klein-4b` (not in the default `MODEL_GROUPS`).

| File (models volume) | Bytes | sha256 | Keep? |
|---|---|---|---|
| `vae/flux2-vae.safetensors` | 336 211 292 | `868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3` | yes |
| `diffusion_models/flux-2-klein-4b.safetensors` | 7 751 105 712 | `ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343` | yes |
| `text_encoders/qwen_3_4b.safetensors` | 8 044 982 048 | `6c671498573ac2f7a5501502ccce8d2b08ea6ca2f661c458e708f36b36edfc5a` | yes |
| `diffusion_models/flux-2-klein-base-4b.safetensors` | 7 751 105 712 | `9c5fed22b76baea749d88fc2abe3ad53245e7b21a0d353a762665eea00043b92` | no, delete |

Not downloaded (reasons in §1):
- every FLUX Non-Commercial model
- FLUX.1 [schnell], which is not plausibly better and has no reference input
- Qwen-Image-2.1, which is under a research licence

Scratch: a Docker volume `fvq-pylibs` (onnxruntime 1.22.1, opencv-python-headless 4.12.0.88, numpy 2.2.6, ~200 MB)
holds the identity script's libraries, outside every service. Remove it with `docker volume rm fvq-pylibs` when it is no
longer needed.

## 8. Incidents during the run (the shared stack)

- **ComfyUI could not encode any prompt.** It was recreated at 00:37 UTC from `vewbox/comfyui:dev` built 2026-10-02
  04:44, before commit 4ba8dda added gcc to the image, and the gcc hot-installed earlier was lost. Every Qwen text
  encode failed with Triton's "Failed to find C compiler", so the shipping pipeline could not draw.
  - I re-ran the documented hotfix inside the running container (`apt-get install gcc libc6-dev python3-dev`; no restart).
  - A new comfyui image with gcc was built at 04:52 local by someone else. The container still runs the old image until
    it is recreated.
- **ComfyUI was restarted by someone else at 01:47 UTC**, between my runs; no record was affected.
- **The fetcher gave up on two files.** With 3 attempts per file and this link (connection resets, SSL timeouts), it
  gave up on the distilled and the encoder files. I finished them with a second fetcher container, given a one-file copy
  of the same manifest entry, which resumed the partial downloads. The fetchers were paused while someone else's comfyui
  image build was running. Consider more retries in `docker/models/fetch.py`.

## 9. What is not verified

- **Small samples.**
  - 6 characters and 6 uploads (all generated stand-ins, no real photographs), 2 seeds each.
  - One reviewer (me), not blind to the arm. The eye scores (finish, likeness) are judgements; the framing check and
    SFace/DINOv2 are the objective parts.
- **Secondary material** (identity sheet, views, expressions, shot frames) was not tested with klein; Edit-2511 stays
  there.
- **Not tried:**
  - klein fp8/nvfp4 (bf16 was used)
  - Qwen Lightning or klein with more steps
  - klein 4B with LoRAs
  - prompt-only fixes for Edit-2511's framing beyond the shipping retry (an outpaint or two-pass recipe might rescue
    Qwen; untested)
- **Measurements:** speed and VRAM are single-machine numbers, and VRAM is the whole card (≈ 3 GB baseline).
- **Arena and community figures (§2)** come from search extracts of different dates.
- **BFL's commercial self-hosted licences** for klein 9B / FLUX.2 [dev]: price on request, not pursued. FLUX 3 Dev has
  no weights or licence yet.

## 10. Evidence (`docs/evidence/flux-vs-qwen/`)

`report.json` (every picture: arm, seed, prompt, wall/engine ms, cold, VRAM baseline/peak, framing, timestamps,
interleaving), `visual-scores.json` (my per-picture scores with notes), `identity.json` (SFace/DINOv2/CCIP per
reference redraw), `summary.json` (the tables above), `extra-uploads.json` (the three extra stand-ins' descriptions),
contact sheets `text-<character>.jpg` (QWEN, QWEN-S, K4D, K4D-S, K4D-T, K4B, K4B-T × 2 seeds) and
`reference-<upload>-<face|noface>.jpg` (upload first), face crops `faces-<upload>.jpg`. PNG originals and fixtures:
`D:/volexar-studio/volexar-studio/var/flux-vs-qwen/` (gitignored). Re-run: commands in the header of
`tools/flux-vs-qwen-gpu.ts`.
