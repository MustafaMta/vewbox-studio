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
