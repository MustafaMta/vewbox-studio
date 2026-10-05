# Model evaluation, October 2026: running log

## Decisions (2026-10-05)

| Capability | Chosen | Key numbers (this card) | Change in the app |
|---|---|---|---|
| Canonical character from text | Qwen-Image-2512 quality (keep) | 6/6 + 9/9 stress first-attempt; 42 s; 29.8 GB | none |
| Reference identity (upload → canonical) | FLUX.2 klein 4B (keep) | 10/10 whole + medium; 4 s; 20.1 GB (Edit-2511 rollback 7/10, 102 s) | none |
| Placing a character in a plate, frames | Qwen-Image-Edit-2511 (keep; only Apache option) | E1 8/12 (Lightning 5/6, quality 3/6); 30 GB | none |
| Location plates / views | 2512 plates (keep); views **unsupported** | plates 6/6; views 0/6 (Qwen-2.1 1/3) | none — do not advertise new camera angles from a master |
| Posters | 2512 key art (keep), Arabic typeset | 4/4 cast; English title 2/2 | none |
| Qwen-Image-2.1 (eval, NC licence) | not switched | E1 6/6 and 7 s, but photo→cartoon medium 0/2, title 0/2 | eval-only manifest group |
| Local LLM (story, planning) | **gemma4:31b-it-qat** (was qwen3:14b) | Iraqi dialogue and shot plans clearly better; 2.5–3× slower; card 21.4 GB; 11/12 valid (one truncation) | default model (code, compose, `.env.example`); lease per model 21500/12000; test `tests/unit/llm-local-model.test.ts` |
| Arabic ASR | whisper-large-v3-arabic-dialectal-v2 (converted, routed) | PASS 54 vs 44, mean CER 0.096 vs 0.102 on 107 synthetic lines | `asr-convert` fixed; `ASR_MODEL_DIR_AR=` reverts |
| Iraqi TTS / English TTS | Habibi IRQ / IndexTTS 2.5 (keep) | 90/107 intelligible; English 18/20 | harness `language` fix |
| Video | MiniMax H3 local Ref2VA turbo (keep) | 3/3 first-attempt clips, lines verbatim, join passes; 31.9 GB, 40.8 GiB RAM | none |

**Open items:** (1) native Baghdadi listening review of `docs/evidence/iraqi-eval/2026-10-run1/review.html` — nothing
Iraqi is verified until it is merged; (2) `MINIMAX_API_KEY` (hosted H3, 2K, H3-Max) — external; (3) `.wslconfig`
`memory=80GB` + `wsl --shutdown` — H3 alone reaches 40.8 of 46.8 GiB; (4) the live `.env` sets
`OPENAI_COMPATIBLE_MODEL` itself: change it to `gemma4:31b-it-qat` (or remove the line) for the switch to take effect;
(5) Gemma's Arabic shot plan can exceed the 9000-token output budget (1/2) — measure a larger budget / 32K context
before relying on it; (6) `engine.ts` `CharacterDesignSchema` strict enums cost a repair on every local design;
(7) IndexTTS appends a garbled syllable to one-word lines (2/2); (8) `IMAGE_VRAM_MB` / VIDEO lease estimates
under-report the measured peaks; (9) real Iraqi clips for the §5.9 ASR gate; Gemma as VLM (§5.6 L3) untested.

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

## 3. Language model: qwen3:14b vs gemma4:31b-it-qat

`llm` service alone (ComfyUI freed): Ollama 0.35.1, both models present (gemma4 QAT Q4_0 17.56 GB, qwen3:14b Q4_K_M
8.64 GB on disk), idle 0.65 GB RAM. Harness `scripts/model-eval-llm.ts`: the story engine's own calls
(`developStory`, `writeScript`, `planShotsDraft` with the shaping and the cast-vs-actions check, an Iraqi `writeScript`
+ `planShotsDraft` of the same scene with the cast speaking Baghdadi, `designCharacter` in Arabic) on The Static Sky
read from the **copy** database `vewbox_modeleval` (the local path takes the GPU lease, which writes
`resource_leases`); the app's own request (`num_ctx` 16384, `keep_alive` 2m, `think: false`, its `max_tokens`).
2 runs per task; every POST is recorded. Evidence: `docs/evidence/model-eval-2026-10/llm/<model>/` (request, answer,
timings, `ollama ps`, container RAM per call).

| | qwen3:14b | gemma4:31b-it-qat |
|---|---|---|
| Loaded (`ollama ps`, 16K ctx, q8_0 KV) | 10.57 GB, 100 % GPU | 19.1 GB, 100 % GPU |
| Card peak (nvidia-smi, incl. ≈ 0.8 GB of idle contexts) | **11.5 GB** | **21.4 GB** |
| `llm` container RAM | ≤ 5.9 GB | ≤ 11.9 GB |
| develop (cold / warm) | 53 / 10 s | 134 / 32 s |
| script | 11–15 s | 49–52 s |
| shot plan, one scene | 37 s (102 s with 2 repairs) | 102–108 s |
| Arabic script / Arabic shot plan | 17 s / 43–76 s | 42–46 s / 125 s |
| Schema-valid on the first call (12 calls) | 8/12 | 9/12 |
| Valid after the engine's repairs | 12/12 | **11/12** — Arabic plan run 2: the first answer hit `max_tokens` 9000 (truncated JSON, 4076 + 9000 tokens), two repairs did not recover it: job failure |
| Character design | 0/2 first call (repaired) | 0/2 first call (repaired) |

**The design repairs are an app fault, not a model fault:** both models answer `"sex": "male"`; `engine.ts`'s
local `CharacterDesignSchema` uses a strict `z.enum(['FEMALE','MALE'])` (and for `voice.pitch/pace`) instead of the
lenient enums of `story/schemas.ts`, so every local design costs a repair round (≈ +10–20 s). Flagged, not fixed here.

**Quality (my reading; the Arabic needs the native raters of §5.6 L2):**

- **Iraqi Arabic script** — qwen3:14b writes mostly MSA with broken grammar and misused dialect words: «هذي النموذج»
  (gender), «اللحام ما زادت، كنت تعتقد الزمن ما خربت إيوي», «الصمت أحيانًا يصرخ أقوى» (MSA), «هواية… شنو تقول؟» glossed
  "Hobby…" (هواية = "a lot"), «خوش؟» glossed "How's it going?". Gemma writes natural Baghdadi with the studio's
  spelling: «آني… لگيته. أخيراً لگيته»، «يا ستار! نجم؟ شجابك بهالليل والجو مگلوب؟»، «فدوة لعينك»، «خل نشوف هذا الگلب
  القديم بعده يدگ لو لا»، «أوووف! بعده بي حيل!», glosses accurate (one «لكيت» with ك in run 2).
- **Shot plan (scene 1, 30 s budget)** — qwen3: 4 shots / 20 s, three actions crammed into 1.5–4 s beats, prompts
  with placeholders ("Elias's Workshop: same as before"); Gemma: 5 shots / 30–33 s, beats timed to the action
  (3–4 s), speaker named in the beat, prompts concrete and name-free with motivated light; one missed cast member was
  added by the cast-vs-actions check (`notes`), as designed.

**Verdict.** Gemma 4 31B is clearly better at what the local model is for in this studio (Iraqi dialogue, staged shot
plans) at 2.5–3× the latency and 2× the card. Reliability is not better: 1 unrecovered failure in 12 (a truncation
with a known cause) against 0. **Decision: Gemma becomes the local default for story and planning; qwen3:14b stays
selectable** (`OPENAI_COMPATIBLE_MODEL=qwen3:14b`) — on the condition recorded as an open item: the Arabic shot plan's
output budget (9000 tokens inside a 16K context) must be re-measured, since a verbose Gemma plan can exceed it. The
hosted engines still win `LLM_PROVIDER=auto` when a key exists. The VLM role (§5.6 L3) was not tested here.

## 4. Voices (measurements only — not a quality verdict)

Services started one at a time (ComfyUI idle, `llm` stopped): `asr` (both Whisper models present, the dialect one
converted), `tts-habibi` (Habibi IRQ `model_100000`), `tts` (IndexTTS 2.5); each idle ≈ 60–75 MB RAM and no VRAM
until first use (lazy load). Loaded together: **card peak 13.5 GB**, RAM asr 1.0 / tts 2.5 / habibi 2.5 GB.
Harness `scripts/voice-eval.mjs` exactly as `docs/voice/IRAQI-EVAL-SET-2026-10.md` §4 says (designed seeds →
`--allow-synthetic`, `--prepare both`); one fix: the harness sent `language=ar` to IndexTTS for every line, so a
Latin-script line now goes with `language=en` (found by the English set).

**Iraqi set** (`docs/evidence/iraqi-eval/2026-10-run1/`: 111 WAVs, `report.json`, `review.html`): 60 lines × the two
designed seeds (SYNTHETIC REFERENCES — a pipeline check, not a voice claim); every Arabic line was transcribed by
**whisper-large-v3-arabic-dialectal-v2** (111/111).

| Measure | Result |
|---|---|
| Intelligible, harness fold (CER ≤ 0.15) | 86/111 |
| Intelligible, **studio fold** (`normalizeIraqi`: spelled numbers ≡ digits; Habibi lines) | **90/107** (male 47/57, female 43/50); studio verdict PASS 55 / REVIEW 26 / FAIL 26 |
| Flagged MSA-like (heuristic §4.3) | 0 |
| Loudness / true peak | mean −21.1 LUFS; 18 short lines below −23 LUFS (−23.0…−25.6); peak ≤ −0.99 dBTP on every line |
| Speed | Habibi median 0.59 s per line, RTF 0.26 (first line 13.9 s with the load); IndexTTS RTF 0.62 (first 26 s) |
| Raw digits vs prepared (num-04) | raw 2/2 garbled («سنة الثني مشان فش»); prepared: male heard as written, female said every word right («سبعة ونص… خمسطعش… ميتين وخمسين ألف») — the text preparation is necessary |
| Real misreadings left | the short exclamations «صدگ؟ ما اصدگ!» (2/2 → «صد. ماص» / «صدى») and «عفية عليك! هيچ اريدك!» (2/2 lost words); «باچر اربعطعش شباط» 2/2; «عتيگ» heard «أتي»; «اسمع...» dropped at a line start |
| Code-switched lines on IndexTTS | every English word spoken (heard as «الواي فاي… الاب… الباتري», «أوكي… تست… ريدي»); CER 0.33–0.48 is the script mismatch of the metric, not a missing word |

**Not verified:** naturalness, Baghdadi dialect, گ/چ pronunciation, emotion, same-voice — `review.html` is ready for
the native listener (`listening: PENDING`). Nothing here may be read as "Iraqi verified".

**English** (`docs/evidence/model-eval-2026-10/voice-en/`, 20 lines, `tests/fixtures/voice/english-eval-set.json`,
IndexTTS cloning `tests/fixtures/speech-en.wav`, large-v3): 16/20 by the harness; by reading the transcripts **18/20
correct** — the two numeral "failures" are the ASR writing 250,000 / 87 for the spoken words (the English metric does
not fold numbers). **Real failures 2/20: both one-word lines** — «Nothing.» → "Nothing. Thang.", «Now?» → "Now, de-sip."
(IndexTTS appends a garbled syllable to a one-word line). Mean −18.3 LUFS, peak ≤ −0.99 dBTP, median 2.1 s per line
(RTF 0.65). Emotion (calm vs angry E1/E2) is a listening item.

**ASR A/B for Arabic** (`scripts/asr-ab-iraqi.py` + `scripts/asr-ab-score.ts`, `…/2026-10-run1/asr-ab/`): the same
107 Habibi WAVs transcribed by large-v3 and by the dialect fine-tune (faster-whisper, `language=ar`, beam 5, one-off
container of the `asr` image; 37 s / 40 s for all 107), scored with the studio's own fold and take-gate verdict:

| | large-v3 | whisper-large-v3-arabic-dialectal-v2 |
|---|---|---|
| mean / median CER (studio fold) | 0.102 / 0.057 | **0.096 / 0.034** |
| CER ≤ 0.15 | 86/107 | **90/107** |
| take-gate PASS / REVIEW / FAIL | 44 / 25 / 38 | **54 / 25 / 28** |
| per line | — | better on 31, worse on 14, equal on 62 |

The dialect model writes dialect spelling (ماكو for «مكو», تلاثين) where large-v3 normalises; where it loses, it
writes digits or mishears one word. **§5.9's gate (folded CER ≤ 0.8 × large-v3's) is not met on this proxy: 0.94× on
the mean (0.60× on the median)** — and the gate is defined on 40 real Iraqi clips, which do not exist yet.
**Decision: keep the dialect model for `language=ar`** (the routing the conversion switched on): better on every
aggregate, no regression, English stays on large-v3; `ASR_MODEL_DIR_AR=` (empty) returns Arabic to large-v3.

**Verdict:** keep **Habibi IRQ** (Iraqi) and **IndexTTS 2.5** (English, code-switched) — the measurements show no
engine fault that another installed engine would fix, the text preparation is required for digits, and one-word lines
on IndexTTS need a guard (open item). Iraqi quality is **pending the native listening review**.

## 5. MiniMax H3 local: what it really does on this install

Speech services stopped, ComfyUI alone (`/free` first). Harness `scripts/model-eval-h3.ts`: **The Static Sky**'s own
shot (scene 1, shot 2: Elias, MEDIUM_CLOSE_UP, one line), conditioned exactly as the take handler conditions it —
`resolveShotPack` → `bindingOf` → `h3ReferencePrompt` (linted) → `minimaxH3Video`: the **approved canonical image**
(`gen-4b28ba8fe5`) as `<Picture 1>`/`<Subject 1>`, the workshop master plate as `<Picture 2>`, the drawn opening frame
bound as `<Picture 3>` and anchored at frame 0 by `MiniMaxH3AddGuide`; Ref2VA, 4-step turbo, `simple`, 1344×768,
seed 970007. State read from the copy database; library files read only. Two harness errors before any graph was sent
(a wrong asset field, then a relative `LIBRARY_ROOT`) are recorded in `results.json` as not attempts.
Evidence: `docs/evidence/model-eval-2026-10/h3/` (640 px proxies, sheets, stills, graphs, `V4-join-metrics.json`,
`comfyui-ram.log`).

| Clip | What | Frames (expected) | Audio | Engine | Card peak | ComfyUI RAM | Take gate (large-v3 / dialect ASR) |
|---|---|---|---|---|---|---|---|
| V1 | the shot as the handler sends it, English line | 124 (124) | 32 kHz stereo, −17.3 dB RMS | 119 s (cold load included) | 28.4 GB | **40.8 of 46.8 GiB** | "Obsolescence. Always obsolescence." — CER 0, PASS |
| V4 | the next shot (two-shot, Najm's line) as a **CONTINUATION** of V1: V1's last 22 frames + their sound in one AddGuide at 0, both canonical images + plate re-applied | 158 (158 = 5 s + 22) | yes, −22.7 dB | 145 s | 31.9 GB | 40.5 GiB | from frame 22: "It's still functional, isn't it?" — CER 0, PASS |
| V2 | V1 with the Iraqi line «عتيگ. كلشي يصير عتيگ.» in `<d>[Arabic]` | 124 (124) | yes, −18.3 dB | 87 s | 31.2 GB | 40.2 GiB | «عتيق. كل شي يصير عتيق.» — CER 0.05 (ق for گ), PASS; dialect = listening item |

**Picture (by eye):**

- **Identity** held in every frame of V1/V2/V4: Elias's cap with the red button, the scar, the fur-collared yellow
  coat, the striped sweater; in V4 Najm enters matching his canonical image (grey beard, glasses, top knot, brown
  cardigan). The plate's workshop (window with meteors, shelves of radios, the portrait) is kept.
- **The opening-frame anchor holds ≈ 1 s, then H3 hard-cuts** to the prompt's MEDIUM_CLOSE_UP (V1, V2) — the drawn
  opening frame is a wide shot of the room while the shot is planned close; the same conflict as E6b. **V2 shows a
  translucent double exposure at that cut** (ghosting, one frame strip).
- **The continuation guide behaves as the continuity code assumes:** the head re-renders V1's tail (PSNR mean
  35.3 dB, min 33.8, SSIM 0.963 over the 22 frames — close, not identical: it is regenerated, so the trim of 22 frames
  is needed and correct); the join (V1's last frame → V4's frame 22) PSNR 25.4 dB ≥ the intra-shot 5th percentile
  18.2 → passes; sound at the join −44.0 → −38.1 dBFS, head −31.5 vs tail −31.3 dB. V4 then changes camera to a wide
  two-shot inside the take (an in-take cut H3 chose).

**Verdict:** keep local H3 Ref2VA with the turbo LoRA. Measured capabilities: 5 s at 1344×768 with native 32 kHz
stereo sound, the scripted English line spoken verbatim, an Arabic `<d>` line spoken intelligibly, reference identity
held, continuation joins within the intra-shot range. **Not supported / not to advertise:** holding a drawn opening
frame whose framing differs from the shot's (it cuts after ≈ 1 s), a guaranteed single continuous shot (H3 may cut
inside a take), Iraqi dialect (not claimed by MiniMax; pending the listener). **Memory:** ComfyUI alone reaches
40.8 GiB of the 46.8 GiB VM while staging H3 — nothing else fits beside it until `.wslconfig` raises the limit.

**Hosted MiniMax (documented only — no `MINIMAX_API_KEY`, external blocker).** The platform guide (fetched
2026-10-05) lists `MiniMax-H3` (768P and **2K**, 4–15 s) and `MiniMax-H3-Max` (480P/768P, 5–15 s, faster), first and
last frame, up to 9 reference images, 3 reference videos and 3 reference audios, frame + reference roles combined,
a **2K regeneration** task (`Create Video Regeneration Task`) and an **H3-Context-IR** prompt-interpretation task;
no extension/continuation endpoint is documented. What it would add over local: 2K finals, H3-Max throughput, no
card or host-RAM pressure. Today's guide says frame and reference roles can be combined, which contradicts
MODEL-STACK §2.2 ("cannot be mixed", 2026-10-04) — the shot-pack lowering (`lowering` for hosted reference mode)
should be re-checked against a real key before any hosted run.
