# Model evaluation, October 2026: running log

AI Research Director, 2026-10-05. The controlled tests of `MODEL-STACK-2026-10.md` §5, run on the RTX 5090 (32 GB)
with the studio's own graph builders, straight against the services (ComfyUI :8188, Ollama :11434, TTS :8020/:8021,
ASR :8030). Job intake stayed paused the whole time (`studio_meta.paused_at` 2026-10-03 11:39, "Redesign phase");
the worker never ran; nothing was written to the `vewbox` database or the media library. Evidence files:
`docs/evidence/model-eval-2026-10/`; originals under `var/model-eval/` (gitignored).

Conventions: numbers are measured here unless marked [E]. "First attempt" = the first picture/clip for an input and
seed, judged by eye at full size; a failed attempt is recorded with its cause and never regenerated.

## 1. Services, one at a time

Host RAM seen by Docker: `MemTotal 49,059,472 kB` (46.8 GiB); no `%UserProfile%\.wslconfig` (unchanged, open item).

| Service | Started | Idle VRAM (nvidia-smi) | Container RAM (docker stats) | Health |
|---|---|---|---|---|
| comfyui | 01:35 | 496 MiB | 1.13 GiB | `/system_stats`: ComfyUI 0.38.1, torch 2.13.0+cu130, templates 0.11.73; vram_free 32.4 GB |

- `docker run --rm --entrypoint sh vewbox/comfyui:dev -c "command -v gcc"` → `/usr/bin/gcc`, Triton 3.7.1 (the image
  is the rebuilt one; no recreate needed, `docker compose up -d comfyui` only started the existing container).
- `node scripts/check-comfy-nodes.mjs` with `TEMPLATES_JSON` exported from the registry under tsx (15 templates,
  including `minimax-h3.ref2va-continuation`): **every class and input present, every pinned model visible**,
  every literal value of every template inside its range/option list.
- ComfyUI 0.38.1 also exposes `TextEncodeQwenImage21` (up to 16 reference images) and `QwenImage21Cache`: the
  licence-gated Qwen-Image-2.1 evaluation arm is runnable on this install. Its weights were fetched for the A/B only
  (manifest group `eval-qwen-image-2.1`, outside the default `MODEL_GROUPS`; int8 DiT 7.26 + Qwen3-VL-8B int8 TE 9.35
  + VAE 0.68 GB, 17.28 GB, sha256-verified, 61 min at ≈ 4.7 MB/s). Graph = the official template
  `image_qwen_image_2_1_{t2i,image_edit}` (25 steps, cfg 1, euler/simple, `QwenImage21Cache` auto), prompt enhancer off.
- **`asr-convert` failed as shipped** (`AttributeError: 'list' object has no attribute 'keys'`): the fine-tune's
  `tokenizer_config.json` was written by transformers 5.13 (`extra_special_tokens` as a list), which the pinned
  transformers 4.57.1 refuses. Fix in `compose.yaml`: convert from a temporary copy whose config drops that key
  (`tokenizer.json` carries the tokens; weights symlinked). Re-run: CT2 fp16 written, 2.9 GB, `model.bin`
  3,087,284,237 B (CPU, ≈ 6 min).

## 2. Image models, controlled test

Harness `scripts/model-eval-images.ts`: the studio's own builders (`qwenCanonicalImage`, `canonicalPrompt` +
`canonicalIdentityLine` from the §5.1 sheets, `locationPrompt`, `qwenEdit`, `referenceReadGraph` →
`identityLineFromDescription` → `kleinReferenceCanonical` / `qwenReferenceCanonical`), seeds 970007/970008, the
studio's framing check on every canonical-frame picture, card peak from nvidia-smi at 250 ms. Evidence:
`docs/evidence/model-eval-2026-10/images/` (`results.json`, 768 px proxies, `sheet-<phase>-<style>.jpg` with the cell
order in `sheets.json`, every graph). Arms: **2512q** (shipping canonical: no LoRA, 30 steps, cfg 4), **2512d**
(Lightning 8-step draft), **klein** (FLUX.2 klein 4B from text, 4 steps), **qi21** (Qwen-Image-2.1, evaluation),
**edit-q/edit-d** (Edit-2511 quality 24 steps / Lightning 4), **edit-ref** (Edit-2511 Image Reference rollback).

**Harness errors, not attempts.** Pass 1 drew 12 E1 edits before their plate and canonical image existed (the ids were
sorted alphabetically) and looked for three A/B uploads in the wrong folder: 24 items failed with ENOENT before any
graph reached ComfyUI (`submitted: false` in `results.json`). They were run in pass 2 as first attempts; the script
now separates an engine error (never re-run) from a harness error.

### 2.1 Characters, T2I (C1 cartoon kite-maker, C2 anime courier, C3 realistic pharmacist; 2 seeds)

| Arm | Whole figure (framing check / eye) | Medium right | One-sided details on the correct side | Engine (warm) | Card peak |
|---|---|---|---|---|---|
| 2512q | 6/6 / 6/6 | 6/6 | 6/6 (string on his right wrist; strap over her left shoulder; badge and watch left) | 42 s | 29.8 GB |
| 2512d | 6/6 / 6/6 | 4/6 — cartoon drawn semi-real painted (2/2, as REPORT §3) | 6/6 | 6–9 s | 29.8 GB |
| klein (T2I) | 6/6 / 6/6 | 6/6, anime flatter, cartoon stiffer and plastic | 4/6 — kite string on **both** wrists (2/2, an invented duplicate) | 2 s | 20.1 GB |

C3 reads older than 34 on every arm (greying hair pulls the age up); no arm is better there. No anatomy error visible
at proxy size in the 18 pictures. **Verdict: keep 2512 quality** (Qwen-Image-2.1 pending, §2.6).

### 2.2 Anatomy and style stress (2512q, 3 poses × 3 styles, seed 970007)

Crossed arms, running mid-stride, a tea glass in both hands: 9/9 whole figures, 9/9 medium right, 9/9 limbs and
hands plausible by eye (the tea glass held by two correct hands in C1/C2/C3), side details kept. 42–51 s each.

### 2.3 Location plates and views

- **L1 master plate** (one per direction, seed 970007): 2512d 3/3 and 2512q 3/3 usable — arcades, balconies, stalls,
  empty street, morning haze; medium right 6/6. The anime plate in Lightning is closer to a painted illustration; the
  quality anime plate is the cleanest anime background. 2512d 6 s (22 s cold), 2512q 27 s; peak 28.2–29.0 GB.
- **L2 views from the realistic plate** (Edit-2511, reverse angle / one stall / dusk, edit-q and edit-d):
  **0/6 did the asked change** — every view keeps the master's composition, none is a reverse angle, a stall close-up
  or a dusk light; all six are over-sharpened and over-saturated against the plate. Same as D24 (`location-views`).
  Note: the wording was §5.3's through `locationPrompt`, not the handler's `landmarkViewPrompt`.
  50 s quality, 6–16 s Lightning.

### 2.4 Posters (2512q, P1 key art without text, P2 with the title asked in the prompt)

4/4 keep both characters by the canonical checklist (patchwork waistcoat, grey dishdasha, sandals, red string; yellow
jacket, strap, red sneakers); P1 leaves the top ≈ 25 % as sky (2/2). **P2 rendered "THE KITE MAKER" exactly in 2/2
seeds** (English only; Arabic titles stay typeset). 31–32 s at 896×1344, peak 29.3 GB.

### 2.5 E1: a canonical character placed in its direction's plate (image 1 plate, image 2 canonical, 2 seeds × 3)

Pass 2 was cut by a machine restart after 11 of 12 (the 12th had not returned a picture; it ran after the restart as
its first attempt).

| Arm | Usable first attempt | Failures and cause | Engine | Peak |
|---|---|---|---|---|
| Edit-2511 Lightning (edit-d) | 5/6 | C2 s1: no kite in her hand (prop dropped) | 7 s (30 s cold) | 30.0 GB |
| Edit-2511 quality (edit-q) | 3/6 | C1 s2 and C2 s2: the plate is **replaced** by a new street (C1 adds passers-by); C3 s1: **the person is missing**, only the kite is drawn | 81–102 s | 30.0 GB |
| Qwen-Image-2.1 (qi21e, eval) | 6/6 | (C1 s2 holds two kites, a minor invented duplicate) | 7–10 s | 22.3 GB |

Identity by checklist kept wherever the person is present (all arms); Qwen-2.1 draws the person smaller in frame.

### 2.6 Reference-based character (the Image Reference read + redraw; 5 uploads × 2 seeds)

Uploads from the A/B sets (`var/flux-vs-qwen/{confirmation/,}fixtures`, generated stand-ins, no real person). Note:
the id `ir2-bust` is the file `upload-photo-headshot.png` (a head shot), mislabelled in the harness; the picture is
what the table says. Reads (MediaPipe + Qwen3.5-4B, once per upload): 1 face each, 15–22 s.

| Arm | Whole figure (framing check, confirmed by eye) | Medium right | Likeness (eye) | Engine | Peak |
|---|---|---|---|---|---|
| **klein 4B** (shipping) | **10/10** | 10/10 | high on all five (face, glasses, cap, hoops, pigtails kept) | **4 s** (15 s cold) | **20.1 GB** |
| Edit-2511 (rollback) | 7/10 — s970008 came back waist-up or a head close-up on ir2, ix1, ix2 | 10/10 | good; ic4 s1 a rounder new face | 101–120 s | 30.4 GB |
| Qwen-Image-2.1 (eval) | 10/10 | **8/10 — the photo → cartoon redraw (ix2) stayed a photograph 2/2** | high | 11–14 s | 22.4 GB |

### 2.7 Qwen-Image-2.1 on the rest of the set (evaluation only)

- **T2I** 6/6 whole, sides right 6/6; **anime the cleanest of any arm** (modern TV anime), realistic the closest to
  the stated age; **cartoon flatter and muted** (desaturated patchwork, less feature-animation finish than 2512q).
  7 s (17 s cold), peak 17.5 GB — 6× faster and 12 GB lighter than 2512 quality.
- **Stress** 9/9 limbs plausible by eye; framing check 8/9 (C3 running: the toe touches the bottom edge).
- **Plates** 3/3 usable composition, but the cartoon plate reads semi-real and carries a gibberish shop sign
  ("IMEOARO"); 5 s, 17.0 GB.
- **Views** 1/3: the stall view moves the camera to a stall (the only real view change in the whole test); the
  reverse angle and dusk keep the master, washed out.
- **Posters** P1 2/2 cast right, the kite actually released; **P2 0/2 — no title rendered**.

### 2.8 Verdicts (images)

| Capability | Verdict | Evidence |
|---|---|---|
| Canonical character from text | **keep Qwen-Image-2512 quality** | 6/6 + 9/9 stress first-attempt, all gates; 42 s, 29.8 GB |
| Draft pictures | keep 2512 Lightning for plates and drafts, never for a Cartoon canonical | cartoon medium 0/2 in draft |
| Reference identity (upload → canonical) | **keep FLUX.2 klein 4B**; Edit-2511 stays the rollback only | 10/10 whole + medium vs 7/10; 25× faster |
| Location plates | keep 2512 | 6/6 usable |
| Location views (another camera angle) | **unsupported by every installed model** — do not advertise reverse angles or time-of-day re-lights from the master | Edit-2511 0/6, Qwen-2.1 1/3 |
| Shot frames / placing a character in a plate | keep Edit-2511 (only Apache-licensed option); record that Lightning beat quality here (5/6 vs 3/6, one seed pair — not enough to switch the frame mode) | §2.5 |
| Posters | keep 2512 key art; English title in-model allowed on evidence 2/2 (≥ 3/4 asked by §5.4 — needs two more seeds before it is a default); Arabic typeset | §2.4 |
| Qwen-Image-2.1 | **no switch** — it fails two gates the shipping models pass (medium on a photo → cartoon redraw 0/2, P2 title 0/2; cartoon finish below 2512) and is non-commercial. It is the strongest **editor** measured (E1 6/6, the only view change); worth a licence enquiry if placement/edit quality becomes the bottleneck | §2.5–2.7 |

First-attempt success, shipping arms: T2I canonical 6/6, stress 9/9, plates 6/6, posters 4/4 (P2 title 2/2),
reference klein 10/10, E1 placement 8/12, views 0/6.
