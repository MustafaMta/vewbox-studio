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
(9) real Iraqi clips for the §5.9 ASR gate; Gemma as VLM (§5.6 L3) untested. **Closed 2026-10-05 (§6):** (5) the
Arabic shot plan's truncation — plans now fit the context or are planned in parts, Gemma re-run 3/3; (6) the design
schema's strict enums; (7) IndexTTS one-word lines — 18/18 clean after the lead-in cut; (8) the IMAGE/VIDEO lease
estimates are the measured peaks.

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

## 6. Follow-up fixes (Backend, 2026-10-05): open items 5–8

Job intake stayed paused; the services were started one at a time (`llm`, then `tts` / `asr` alternately) and called
directly; nothing was written to `vewbox` or the library (the LLM harness reads and leases on the copy
`vewbox_modeleval`, migrated to 0026 for this run).

### 6.1 Gemma's Arabic shot plan no longer truncates (item 5)

**Cause.** The plan asks 10–15 shots for the 60 s scene; Gemma writes ≈ 700–1,100 tokens per shot (pretty-printed
JSON), so a long plan needs 11–17K tokens against `max_tokens` 9000 — and the two repairs that sent the cut answer back
ran out of the 16K context themselves (10,885 + 5,499 and 15,697 + 687 tokens, `ar-plan-run2`).

**Fix** (`src/server/providers/llm.ts`, `src/server/story/engine.ts`): every answer reports its stop reason;
a cut answer (`finish_reason: "length"`, or JSON left unterminated) is never repaired or parsed — it is asked again once
with the whole room the context has left (`OLLAMA_CONTEXT_LENGTH` − prompt − 384), else `TruncatedAnswerError`. The
planner gives each call that whole room (≈ 10.6–10.8K here, inside the measured 16K context — no larger context was
needed) and **plans the scene in parts** (beats halved, up to 8 parts; the second part continues from the first part's
last shot, its lines indexed on their own) when the most shots it may take × 1,100 tokens would not fit, or when an
answer is cut anyway; a one-beat scene that is cut fails the job. Repair rounds get only the room left after the
history. Tests: `tests/unit/llm-truncation.test.ts`.

**Re-run** (`scripts/model-eval-llm.ts --tasks ar-plan --runs 3 --ar-scene-from …/ar-script-run1.json`, the same Arabic
scene and prompt as the failed run; evidence `docs/evidence/model-eval-2026-10/llm/gemma4_31b-it-qat/rerun-2026-10-05-ar-plan/`):

| Run | Calls (prompt + answer tokens, stop reason) | Result | Time | Card peak |
|---|---|---|---|---|
| 1 | part 1: 3,785 + 5,274 stop; part 2: 3,955 + 6,580 stop | **valid**, 14 shots / 63 s, all 6 lines once | 258 s | 20.6 GB |
| 2 | part 1: 3,785 + 6,474 stop → repair (one `screenDirection` value invalid) 7,742 + 4,196 stop; part 2: 3,944 + 5,553 stop | **valid**, 13 shots / 65 s, all 6 lines once | 310 s | 20.6 GB |
| 3 | part 1: 3,785 + 6,151 stop; part 2: 3,953 + 5,273 stop | **valid**, 12 shots / 62 s, all 6 lines once | 221 s | 20.6 GB |

**3/3 valid, 0 truncations** (was 1/2 with one unrecovered failure). Every plan totalled 11.4–12.0K answer tokens —
more than the old 9000 and more than one call's room — so the split, not a larger budget alone, is what makes it fit;
no part needed more than 6,580 of its ≈ 10.6K. Parts make the plan 2–2.5× slower than one call (221–310 s against
125 s for the one valid run before). The second part's first shot was planned `continuous` in run 2 (the shaping now
keeps a later part's opening boundary; only the scene's first shot is forced to a transition). The repair in run 2
was sent with `max_tokens` 10,776 on a 7,742-token prompt (above num_ctx); repairs are now capped at the room left.

### 6.2 Character design accepts what the models write (item 6)

`CharacterDesignSchema` (engine.ts) and the reference-mode design read `sex`, `voice.pitch`, `voice.pace` from the
model's words (`wordEnum`, `src/server/story/lenient.ts`): the exact value in any case, else the one category whose
whole words appear ("male" → MALE, "Medium-low" → LOW, "mid-high" → HIGH, "rhythmic with theatrical pauses" →
MEASURED, "Slow and rhythmic" → SLOW); no category ("purple", "gravelly") or contradicting ones ("low to high", "male or
female") still fail. On the recorded first answers: Gemma 2/2 and qwen3 run 2 now valid without a repair; qwen3 run 1
keeps only its genuine mistake (a 120+ character `role`). Test: `tests/unit/design-enums.test.ts` (reads the evidence).

### 6.3 One-word English lines on IndexTTS (item 7)

**Cause (through the TTS API, `tests/fixtures/speech-en.wav`, seeds 7/11/23):** IndexTTS 2.5 does not stop after one
word — its speech model generates to ≈ 1.3–1.5 s and fills the rest with an invented syllable; the take is
deterministic per seed. Punctuation does not cure it: "Nothing..." 1/3 still garbled, "... Nothing." 3/3, "Nothing,"
3/3; "Now?!" was clean 3/3 but changes the delivery. Spoken after a sentence, the word ends a longer utterance and is
clean with its own closing mark (lead-in before: 36/36 clean over two lead-ins; a carrier after the word: 6/6, but the
word loses its final intonation).

**Fix:** `prepareLineText` (IndexTTS, one Latin word) prepends "That is all I have to say."; `speakLine` transcribes
the take, finds the line's word as the last thing heard, cuts at the latest quiet 10 ms before it (keeping 40 ms of the
pause and the WAV's provenance chunk, 12 ms fade-in); a take whose word is not found is spoken again alone (and judged
by the line check). Evidence `docs/evidence/model-eval-2026-10/voice-en/one-word/` (`scripts/one-word-eval.ts`,
large-v3):

| | Nothing. | Now? | Yes. | Run! | Why? | Okay. | Clean |
|---|---|---|---|---|---|---|---|
| **Before** (alone) | "Nothing. Thang." / "Nothing. Thing." / "Nothing. Sound." | "Now, de-sip." / "Now, MC." / "Now." | "Yes." / "Yes. Yes." / "Yes, yes." | "Run." / "Run." / "Run. Sean." | "Why?" / "Y. Singer." / "Why? Jerk." | 3 × "Okay." | **8/18** |
| **After** (lead-in, cut) | 3 × "Nothing." | "Now" / "Now." / "Now." | 3 × "Yes" | 3 × "Run" | 3 × "Why?" | 3 × "Okay." | **18/18** (word located 18/18) |

Cut lines are 0.61–1.07 s, the word starting at 0–0.11 s. The question intonation of "Now?" is heard by ASR as "Now."
before and after (as for the one clean take alone): a listening item, not measured here. Test: `tests/unit/lead-in.test.ts`.

### 6.4 Lease estimates (item 8)

`src/server/gpu/estimates.ts`: `IMAGE_VRAM_MB` 30400 (was 24000; Edit-2511 peak 30.4 GB, 2512 29.8, klein 20.1) and
`VIDEO_H3_VRAM_MB` 31900 (was 28000; H3 V4 peak), with H3's host RAM recorded beside them (40.8 of 46.8 GiB, ≈ 6 GiB
headroom until `.wslconfig`). `tests/unit/gpu-estimates.test.ts` reads GPU-STAGING §6 and fails if an estimate is below a
recorded peak. `GPU_VRAM_BUDGET_MB` stays 30000: its warning now fires on every Qwen and H3 job (a decision left open).

## 7. Image model upgrade (2026-10-06, model-upgrade directive §§2, 9; final local directive §6)

Image-model engineer, 2026-10-06. Rule: commercial-safe weights only (producer, 2026-10-06); candidate → benchmark →
real-UI test → comparison → promote; the incumbent stays until the replacement proves better.

### 7.1 What exists (research 2026-10-06, primary sources)

Sources: Hugging Face model cards and API trees (`/api/models/<repo>`, `/tree/main`), the Artificial Analysis arenas
(open-weights T2I board and the open-weights image-editing board, fetched 2026-10-06), the running ComfyUI 0.38.1
`/object_info` and its bundled templates (comfyui_workflow_templates 0.11.73).

| Model | Params | Licence (verified) | Arena (AA, open weights) | ComfyUI 0.38.1 | Decision |
|---|---|---|---|---|---|
| Qwen-Image-2512 (incumbent T2I) | 20B DiT + Qwen2.5-VL-7B | apache-2.0 (card) | T2I 999 | core | keep; **bf16 candidate** (§7.3) |
| Qwen-Image-Edit-2511 (incumbent editor) | 20B + 7B | apache-2.0 (card) | Edit 1021 (best commercial) | core | keep; bf16 only if JoyAI loses |
| FLUX.2 [klein] 4B (incumbent reference) | 4B + Qwen3-4B | **Apache-2.0** (BFL repo LICENSE.md) | T2I 863, Edit 948 | core | challenged (§7.3) |
| **JoyAI-Image-Edit(-Plus)** (JD, paper arXiv 2605.04128) | **16B MMDiT** + Qwen3-VL-8B | apache-2.0 (jdopensource cards, Comfy repack) | not on the board | core `TextEncodeJoyImageEdit`, ≤ 6 refs | **candidate** |
| Qwen-Image-2.1 | 7B + Qwen3-VL-8B | Qwen Research Licence (NC) | T2I 1036, Edit 1073 | core | research reference only (§2.7) |
| FLUX.2 [dev] | 32B + Mistral-24B | FLUX Non-Commercial, gated | T2I 1000, Edit 1000 | core | **excluded** (producer: commercial-safe only) |
| FLUX.2 [klein] 9B | 9B | FLUX Non-Commercial | T2I 941, Edit 1013 | core | **excluded** |
| HunyuanImage 3.0 Instruct | 80B MoE | community, territory exclusions | Edit 1066 | API node only | does not fit, licence |
| HiDream-O1-Image | 8B pixel-space | MIT | T2I (dev) 875, Edit 951 | core, ≤ 100 refs | not taken: ≈ klein 4B on the arena, 4-MP native (slow) |
| Ming-Image 0.1 Design | 6B + Ling-mini-2.0 | MIT | T2I 998 | core | not taken: a graphic-design model (UI, posters, text), ≈ 2512 |
| FireRed-Image-Edit 1.0 | 20B (Qwen-Edit lineage) | apache-2.0 | — (GEdit 7.94 vs 2511 7.88) | core | not taken: +0.07 GEdit is not material |
| Krea-2, Boogu-Image, Mage-Flow | — | Krea community / Apache / MIT | not ranked | core | not taken |

Reading: among commercially usable weights the shipping Qwen pair is still the top of both arenas; nothing commercial
and larger ranks above them. The upgrade room is therefore (a) **precision** — the canonical engine ships as a plain
`fp8_e4m3fn` cast of a 20B model, its bf16 original (40.86 GB) needs partial loading on 32 GB — and (b) **the roles where
the incumbents are weak** — Image Reference runs on the 4B klein, placement in a plate was 8/12, location views 0/6 —
where JoyAI-Image-Edit (16B, Apache, spatial/camera editing, 6 references) is the one new commercial contender.

### 7.2 Licences of the incumbents (verified 2026-10-06)

- **FLUX.2 [klein] 4B**: Apache License 2.0 — `black-forest-labs/FLUX.2-klein-4B` LICENSE.md (rev e7b7dc2), the
  Comfy-Org repack tagged apache-2.0. Commercial use allowed. (The NC FLUX weights are klein 9B, FLUX.2 [dev], FLUX.1.)
- **Qwen-Image-2512, Qwen-Image-Edit-2511** and the lightx2v Lightning LoRAs: apache-2.0 (model-card licence; the Qwen
  repos carry no separate LICENSE file). Commercial use allowed.
- **JoyAI-Image-Edit**: apache-2.0 on `jdopensource/JoyAI-Image-Edit`, `jdopensource/JoyAI-Image-Edit-Plus-ComfyUI`
  and `Comfy-Org/JoyAI-Image-Edit` (not gated). The repack's VAE is `wan_2.1_vae` — used only as JoyAI's image latent
  codec; no Wan video model is installed or used.
- **MiniMax H3 (local)**: §8.1 — commercial use allowed with conditions, including a territory restriction on the
  Outputs.

### 7.3 Candidates, downloads, benchmark

Candidates (≤ 3 new): (1) **JoyAI-Image-Edit int8_convrot** (DiT 16.43 GB + TE 10.06 GB + VAE 0.25 GB; manifest group
`eval-joyai-image-edit`, pinned rev 8010e7b) for Image Reference, placement, identity-preserving edits, multi-character
frames and views; (2) **Qwen-Image-2512 bf16** (40.86 GB, group `eval-qwen-image-2512-bf16`, rev 1f12b17) for
characters, plates, posters; (3) Qwen-Image-Edit-2511 bf16 only if JoyAI does not win the edit roles.

Harness: `scripts/model-eval-images.ts --tag upgrade` (results `docs/evidence/model-eval-2026-10/images-upgrade/`,
originals `var/model-eval/images-upgrade/`), the same briefs, uploads and seeds (970007/970008) as §2, plus two new
phases — **idedit** (the canonical image redrawn sitting, three-quarter, laughing) and **multi** (C3 and a second
realistic person C4 placed together in the realistic plate) — SFace cosine per picture (asr `POST /qa/identity`,
START threshold 0.363) and the comfyui container's RAM (docker stats) beside the card's VRAM. Every GPU batch ran
under `scripts/gpu-hold.ts IMAGE 30400`, ≤ 18 min per hold. The incumbents were re-run on this machine (the first run's
originals are not on this workstation), so every arm is measured on the same day, install and inputs.

## 8. MiniMax H3 local: configuration and licence audit (2026-10-06, research only, no GPU)

### 8.1 Licence

"MiniMax H3 Community License Agreement" (MiniMaxAI/MiniMax-H3 `LICENSE`, 2026-08-02; the Comfy-Org repack points to
it). Commercial use is allowed, with conditions:

- **Territory**: granted only in the "Applicable Territory" — worldwide **excluding the EU, the UK, South Korea and the
  USA** — and §V.4 forbids using, distributing or **displaying the Works "or any of their Outputs"** outside it. Read
  literally, a film made with local H3 may not be shown to audiences in those four territories without a separate
  licence from MiniMax (application: platform.minimax.io/h3-license; MiniMax's `docs/QA-about-License.md` calls the
  restriction temporary and offers a formal licence for those regions). This is the material risk for a commercial Vewbox release.
- Over US$20M yearly revenue: prior written authorisation (§IV.1).
- A commercial product must **prominently display "MiniMax H3" in its UI** (§IV.2).
- Users of a product that generates with H3 must be bound to the use restrictions and the AUP (§V.2), which include
  disclosing machine-generated content when posting publicly (AUP 12) and no military use (AUP 19).
- Turbo LoRAs `lightx2v/Minimax-h3-Turbo`: apache-2.0. Text encoder: the shipped `qwen3vl_32b_minimax_h3_nvfp4_awq`
  is converted from `cybermotaz/Qwen3-VL-32B-Instruct-NVFP4`, whose card labels the weights "Qwen License"; the base
  `Qwen/Qwen3-VL-32B-Instruct` is apache-2.0 and the H3 LICENSE names the encoder Apache-2.0, so this reads as a
  mislabel — the Comfy-made `int8_convrot` encoder (from the official weights) removes the ambiguity.

This is a reading of the licence text, not legal advice; the territory question is the producer's.

### 8.2 What exists and what is installed

`Comfy-Org/MiniMax-H3` (rev e5eb578) lists, per task (FL2VA and Ref2VA — the two released checkpoints, both
CFG-distilled; 33B total of which ≈ 13B AdaLN branches that "can be precomputed/cached for inference-only", ≈ 20B
effective, MiniMaxAI card):

| Part | Installed | Other precisions published |
|---|---|---|
| DiT | `*_pruned_int8_convrot` (20.97 GB each) | pruned bf16 40.23 GB, pruned fp8_scaled 20.96, pruned w6a8 15.98, unpruned int8 34.04, unpruned bf16 66.28 |
| Text encoder (Qwen3-VL-32B) | `nvfp4_awq` 15.69 GB (third-party AWQ) | **int8_convrot 27.14 GB**, bf16 51.51 GB |
| Video VAE | `int8_convrot` 2.81 GB | **fp16 5.21 GB** |
| Audio VAE | fp32 0.61 GB (full) | — |
| Turbo LoRAs | ref2v 4-step **v0.1**, fl2v 8-step v1.0 | fl2v 4-step v1.0 768p |
| Other | — | Fun ControlNet Union 2.0, 10 prompt embeddings |

- "Pruned" = the AdaLN branches precomputed (the card's inference-only form), so pruned int8 is not a reduced model;
  the repack says to prefer `int8_convrot` over `fp8_scaled` on cu130 (this install). The unpruned files add bytes,
  not quality. **The DiT choice is already the highest supported precision that fits the card**; pruned bf16 (40 GB)
  would need weight streaming and is the only higher step.
- Open weights are 768p only; the H3-Regenerate-2K module is not open-sourced (MiniMaxAI card).

### 8.3 Configuration in use vs the highest-quality supported configuration

`src/server/providers/video.ts` → `minimaxH3Video` always runs **turbo**: Ref2VA with the 4-step **v0.1** LoRA, FL2VA with
the 8-step LoRA, scheduler `simple`, `ref_image_size: 'match'`, BasicGuider (correct: the checkpoints are CFG-distilled).
The official templates (comfyui_workflow_templates 0.11.73) differ:

- `video_minimax_h3_r2v` and `video_minimax_h3_i2v` ship with the **turbo LoRA switched OFF** ("Enable Lightning LoRA"
  = false) and **20 steps** (`res_multistep`); turbo is the opt-in fast path (i2v turbo: 6 steps).
- The r2v note: "`beta` or `normal` scheduler tends to outperform `simple` for reference-heavy prompts", and
  `ref_image_size: max` (up to a 2048-px short edge) gives "stronger identity fidelity, at the cost of speed".
- So the take handler's comment (`take.ts` "the official template: turbo LoRA, 4 or 8 steps — the standard, not a
  draft") is **not accurate**: the studio runs H3's speed configuration. It is not the highest-quality supported local
  configuration.

**Quality-first candidates for a scheduled VIDEO benchmark** (same shot, seeds and conditioning as §5; each changes one
thing): (V-a) Ref2VA base, no LoRA, 20 steps (expected ≈ 5× sampling time); (V-b) scheduler `beta`; (V-c)
`ref_image_size: max` (identity); (V-d) text encoder int8_convrot (27.1 GB download; also clears the licence label);
(V-e) video VAE fp16 decode (5.2 GB download); (V-f) pruned bf16 DiT (40.2 GB download, weight streaming; RAM headroom now
≈ 78.5 GiB). V-a…V-c need no download. Measures: identity (SFace per frame), lip-sync/script heard back, motion and
in-take cuts by eye, card/RAM peak, latency. This needs the coordinator's VIDEO slot (31.9 GB card, ≈ 41 GiB RAM).

### 8.4 Configuration benchmark (2026-10-06) and the quality tiers

Harness `scripts/model-eval-h3-config.ts` (evidence `docs/evidence/model-eval-2026-10/h3-config/`: `results.json`, graphs;
sheets and 640-px proxies gitignored; originals `var/model-eval/h3-config/`). Two real shots of The Static Sky,
conditioned exactly as the take handler conditions them (`resolveShotPack` → `bindingOf` → `h3ReferencePrompt` →
`minimaxH3Video`: canonical image + plate + drawn opening frame as pictures, the opening frame anchored at 0): **SPK** =
scene 1 shot 2 (Elias, MEDIUM_CLOSE_UP, one English line; §5's V1) and **SIL** = scene 1 shot 1 (WIDE, silent). Seed
970007, 5 s = 124 frames at 1344×768, Ref2VA, first attempts only, every run under `gpu-hold VIDEO`. SFace sampled at
4 fps against the canonical image (START threshold 0.363); comfyui container RAM from `docker stats` in a 78.5 GiB VM.

| Arm | Change from shipping | Engine | Card | RAM | SPK SFace median (frames < 0.363) | SPK picture, by eye | SIL SFace median |
|---|---|---|---|---|---|---|---|
| T | — (turbo 4-step LoRA v0.1, simple, match) | 110 s / 85 s | 31.9 GB | 46.1 GiB | 0.33 (11/20), drift 0.79 | 3 in-take cuts (wide → wrench close-up → face → over-the-shoulder); beard comes and goes, reads as another man at the end | 0.65 (1/21); one continuous push-in to a face close-up |
| **A** | **no LoRA, 20 steps** (template default) | **350 s / 348 s** | 31.7 GB | 46.0 GiB | **0.69 (0/21)**, drift 0.23 | opening frame held 2 frames, then **one continuous MCU** to the end (as planned); cap appears late | 0.52 (0/12 with a face); continuous push-in, holds the wide longer, ends on the radio |
| B | turbo + scheduler beta | 123 s / 85 s | 28.6–31.2 GB | 46.0 GiB | 0.38 (8/19) | **broken**: blown-out, smeared, ghosting frames; same cuts as T | 0.54 (3/21) |
| C | turbo + ref_image_size max | 91 s / 88 s | 31.4–31.6 GB | 46.1 GiB | 0.39 (10/20) | as T, frame for frame | 0.67 (0/21) |
| D | A + ref_image_size max | 422 s | 28.6 GB | 46.0 GiB | 0.63 (0/21) | as A | — |
| E | A + scheduler beta | 371 s | 31.6 GB | 46.1 GiB | 0.28 (11/21) | cuts inside the take to a three-quarter and a back view | — |

Mouth activity (energy windows, START values): every arm is flagged at least once (MOUTH_MOVING_WHILE_SILENT on T, A,
B, D; none on C and E) — not a lip-sync verdict; the real-UI takes are. The line heard back (large-v3, the take gate's `judgeHeard`): "Obsolescence.
Always obsolescence." verbatim on all six SPK arms — CER 0, coverage 1, PASS. The tier does not change the speech.

**Decision (merged as dea25145):** the local engine has two **quality tiers** as capability data
(`src/domain/video-capability.ts` `tiers`): **final** — the default for every take — is arm A (the base model, 20 steps,
`simple`, `match`); **draft** is the turbo LoRA, made only when the producer asks and recorded as `params.quality:
'draft'`. Reasons: on the speaking shot the final tier is the only configuration that kept the planned framing as one
shot and the face on model (0.69 vs 0.33), at the same card and RAM; the silent shot is mixed (both tiers move the
camera; turbo kept the face larger). Cost: ≈ 3.2× engine time (350 s vs 110 s for 5 s); the run deadline now follows the
tier and the length (`h3RunTimeoutMs`, 90–180 min). B (beta under turbo) breaks the picture; C and D change nothing
measurable; E is worse — none is adopted. The ref-image `max` and beta notes of the r2v template do not hold on this
material. Licence: unchanged by the tier — the same MiniMax H3 Community License weights (§8.1: territory limit on
Outputs, "MiniMax H3" shown in the UI, AUP); the turbo LoRAs of the draft tier are apache-2.0 (lightx2v). Next
measurements owed: long (10–15 s) final clips (the deadline estimate scales frames^1.5, unmeasured), the
continuation (V4-style) on the final tier, and the real-UI Tea retakes.

## 9. Image upgrade outcome (2026-10-06): the image stack is frozen

The producer's production-stack directive (docs/directives/PRODUCTION-STACK-DIRECTIVE-2026-10-06.md) froze the image
stack before the candidate arms ran: **Qwen-Image-2512** generates, **Qwen-Image-Edit-2511** edits and keeps
consistency, and Edit-2511 also takes the "character from a picture" role from FLUX.2 [klein] 4B (klein stays only behind
`CANONICAL_REFERENCE_ENGINE=klein` until the Qwen route is proven in the UI). JoyAI-Image-Edit stays an
already-downloaded fallback, with no benchmark arms run (weights verified on the store, graph builder and tests in the
repo). The 27–30B-class search found no commercially usable model in that class more practical than the Qwen pair
(Cosmos3-Super 64.6B: T2I only, 8×H100 class, arena below 2512; HunyuanImage 3.0 83B MoE: territory-excluding licence,
no local ComfyUI runtime) — research references only. Qwen-Image-2512 **bf16** is being fetched as the frozen model's
full precision; it becomes the final image tier only if a focused A/B on three canonical characters shows a visible
gain over fp8 (§10.3).

Measured today on the incumbents (harness `--tag upgrade`, first attempts, `docs/evidence/model-eval-2026-10/images-upgrade/`):
canonical T2I 13/13 whole figures by the framing check and by eye (2512 quality 42–43 s, Lightning 6–10 s warm; card
28.9–30.3 GB; comfyui RAM 29.1–29.9 GiB); plates 6/6 usable (27 s quality, 6–7 s Lightning); posters 4/4 cast right,
the English title 2/2 (32–45 s); location views 0/6 changed the view (Edit-2511 quality 50 s and Lightning 8–32 s both
returned the master's composition — as in §2.3); placement E1 (5 drawn before the freeze): Lightning C1 2/2 (SFace
0.88, 0.82), quality C1 s970007 **the person missing** (only the kite drawn), quality C1 s970008 the plate replaced by a new
street (SFace 0.55), Lightning C2 s970007 usable (SFace 0.54, anime face).

## 10. Promotion records (production-stack directive §23, 2026-10-06)

Paths are logical paths in the model store (`VEWBOX_MODELS_ROOT`, the D: VHDX; ComfyUI reads them under
`/models/comfyui/<folder>/`). VRAM = nvidia-smi card peak at 250 ms; RAM = the comfyui container (docker stats).

### 10.1 Qwen-Image-2512 — image generation (characters, locations, plates, frames, posters, key art)

| Field | Record |
|---|---|
| Checkpoint | `diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors` (Comfy-Org/Qwen-Image_ComfyUI, 20 430 679 144 B, sha256 `5dc80554…876b`); encoder `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` (9.38 GB); VAE `vae/qwen_image_vae.safetensors`; draft LoRA `loras/Qwen-Image-2512-Lightning-8steps-V1.0-bf16` |
| Params | 20B MMDiT + Qwen2.5-VL-7B encoder |
| Precision | fp8 e4m3fn DiT, fp8 scaled encoder (bf16 candidate: §10.3) |
| Licence | Apache-2.0 (model card; commercial use allowed) |
| VRAM / RAM | 28.9–30.3 GB card; 29.1–29.9 GiB container RAM (2026-10-06) |
| Speed | canonical 928×1664 quality (30 steps, cfg 4) 42–43 s warm; plate 1344×768 quality 27 s; poster 896×1344 32–45 s; Lightning 8-step 6–10 s |
| First attempt | canonical 13/13 today + 6/6 and 9/9 stress (§2.1–2.2); plates 6/6; posters 4/4 (English title 2/2) |
| Quality | whole figures with margin, one-sided details on the correct side, cel-shaded anime and feature-animation cartoon only in quality mode (Lightning draws cartoon semi-real — never for a Cartoon canonical); Arabic titles stay typeset |
| Why it holds the role | the strongest commercially usable open T2I on the arena (999; only NC Qwen-2.1 and FLUX.2 [dev] are level or above); no first-attempt failure in 38 canonical/stress/plate/poster pictures |

### 10.2 Qwen-Image-Edit-2511 — editing and consistency, and the character from a picture

| Field | Record |
|---|---|
| Checkpoint | `diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors` (Comfy-Org/Qwen-Image-Edit_ComfyUI, 20 533 762 817 B, sha256 `c9fdc158…a4e`); same encoder and VAE as 2512; draft LoRA `loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16` |
| Params | 20B MMDiT + Qwen2.5-VL-7B encoder; up to 3 reference pictures |
| Precision | fp8 mixed (sensitive layers kept in bf16) |
| Licence | Apache-2.0 (model card; commercial use allowed) |
| VRAM / RAM | 30.0–32.0 GB card (the IMAGE lease estimate 30 400 is its typical peak); 30.4–31.3 GiB container RAM |
| Speed | quality (24 steps, cfg 4) 50 s for a 1344×768 edit, 82–102 s with two references, 101–120 s for the Image Reference redraw at 928×1664; Lightning 4-step 7–32 s |
| First attempt | Image Reference whole figure 7/10 (§2.6; 17/24 in the earlier A/B) — the handler redraws once without the face crop on a framing failure; placement in a plate 8/12 (§2.5) and 3/5 today; location views 0/12 (unsupported: never advertise a reverse angle or a time-of-day re-light from the master) |
| Quality | likeness good on all five uploads (one rounder new face, ic4 s1); quality mode can drop the person or replace the plate in placement (Lightning was steadier there, 5/6) |
| Why it holds the role | the strongest commercially usable open editor on the arena (1021; HunyuanImage 3.0 Instruct and Qwen-2.1 above it are territory-limited or NC); replaces FLUX.2 [klein] 4B for the character from a picture by the producer's directive (one engine family for generation and editing; FLUX no longer a production dependency). Promotion proof owed: one real-UI "from a picture" character (acceptance engineer) |

### 10.3 Qwen-Image-2512 bf16 — candidate final image tier

40 861 031 488 B, sha256 `cbf55390…e075`, Apache-2.0, fetching into the store (group `eval-qwen-image-2512-bf16`). Rule: a
focused A/B on the three canonical characters (C1 cartoon, C2 anime, C3 realistic; the same prompts and seed as §2.1)
against fp8; promoted as the final image tier only on a visible gain at full size, otherwise recorded and fp8 stays.

**Result (2026-10-06, first attempts, the same prompts and seeds 970007/970008 as the fp8 pictures of §9; evidence
`docs/evidence/model-eval-2026-10/images-upgrade/results.json`, `t2i/*-2512bf-*`): NOT PROMOTED — fp8 stays.**

| | fp8_e4m3fn (shipping) | bf16 (candidate) |
|---|---|---|
| Whole figure (framing check / eye) | 6/6 / 6/6 | 6/6 / 6/6 |
| Engine, warm | 42–43 s | 43–44 s (98 s with the first, cold load of 40.9 GB) |
| Card peak | 28.9–30.3 GB | 31.5–31.7 GB (partially loaded) |
| comfyui RAM | 29.1–29.9 GiB | **48.7–48.8 GiB** |

At full size, the two precisions draw the same picture for the same seed: composition, pose, wardrobe, colours and
one-sided details match. Face crops at 500×560 px show no visible gain in detail, skin, hair or line work for the cartoon,
anime or realistic character (the only differences are a slightly warmer skin tone on C1 and one specular highlight on
C2's hair, in either direction). bf16 buys nothing visible, costs about 19 GiB more host RAM and a 1.5 GB fuller card, and
is slower when cold. The file (`diffusion_models/qwen_image_2512_bf16.safetensors`, 40.86 GB, verified) can be deleted
from the store; the manifest group `eval-qwen-image-2512-bf16` stays outside the default groups as the record.

## 11. Planning LLM: production model and promotion record (2026-10-06, model-upgrade directive §§3, 9; production-stack directive)

Planning-LLM engineer, 2026-10-06. Every GPU call ran under the studio's lease (`scripts/gpu-hold.ts LLM <mb>`, background
priority after the lease change), with the `llm` service started only for a batch and the model unloaded (`keep_alive 0`)
at the end of each batch. The engine's own calls ran against the copy database `vewbox_llm`, never `vewbox`. Evidence:
`docs/evidence/model-eval-2026-10/llm-suite/` (requests, answers, per-attempt tokens/stop reasons/reasoning, card and RAM
peaks); harness `scripts/model-eval-llm-suite.ts`, comparison `scripts/model-eval-llm-report.ts`.

### 11.1 Promotion record — `qwen3.6:27b-q8_0` is the local story model

| Field | Value |
|---|---|
| Model / checkpoint | Qwen3.6-27B (Alibaba Qwen, April 2026), Ollama tag `qwen3.6:27b-q8_0` (digest `cd0210c667bf`), on the D: store (`<VEWBOX_MODELS_ROOT>/llm/ollama`) |
| Parameters / architecture | 27.8 B dense (`ollama show`: architecture `qwen35`); hybrid attention — 16 of 64 layers attend, the rest Gated DeltaNet, so the KV cache is small; vision projector `qwen3vl_merger` loaded with it |
| Precision | Q8_0 (29 GB on disk); KV cache q8_0, flash attention, num_ctx 16384 (unchanged) |
| Licence | Apache-2.0 (Hugging Face card `Qwen/Qwen3.6-27B`; the licence text in the Ollama manifest). Incumbent, for the record: Gemma 4 31B — the Hugging Face card `google/gemma-4-31b-it` states "License: apache-2.0" and also links the Gemma Terms of Use (commercial use allowed under Google's prohibited-use policy); both statements recorded as found |
| VRAM | loaded 28.4 GB (`ollama ps`: 66/66 layers, 100 % GPU); card 31,499 MiB loaded, **31,708 MiB writing** of 32,607 — the whole card. Lease estimate 31500 MB (`LOCAL_LLM_VRAM_MB`) |
| RAM | `llm` container ≤ 13.8 GiB, Docker VM used ≤ 17.3 GiB during a call (78.5 GiB VM) |
| Speed (thinking off) | develop (11 scenes, 3,402 answer tokens) 138 s = 24.7 tok/s; short JSON 3.6 s. `LOCAL_LLM_SPEED` 25 tok/s, 15 s prompt per part (feeds the PLAN_SHOTS work deadline) |
| First-attempt success | measured with thinking truly off: 1/1 (episode development valid on the first call; Gemma needed a repair on the same input). The full round was stopped by the production-stack directive before the remaining tasks ran — the real-UI test is the next measurement |
| Quality result | the development answer is coherent and follows the World Bible (Elias will not go on the water, the radio needs meteors, Ruth's entry "Turning back to the point", the logbook sealed since the inquiry); it adds a sensible second place (the street) and the episode's beats in order. **Continuity slip:** the new character "Ingrid" is written **"Ingres"** in three scenes' exit states — a name error the planner must not carry into shots (the script writer resolves names against the cast; watch for it in the real-UI run) |
| Why it replaced Gemma 4 31B | the producer's production-stack directive (2026-10-06) names the Qwen 27B as the production brain; Qwen3.6-27B is the current release of that line (no new download). Its card beats Gemma 4 31B on every shared row (MMLU-Pro 86.2 vs 85.2, GPQA 87.8 vs 84.3, C-Eval 91.4 vs 82.6), it runs at Q8 against Gemma's QAT Q4, and on the one like-for-like task measured it was valid without a repair |
| Fallbacks | `gemma4:31b-it-qat` stays installed as the emergency fallback (`OPENAI_COMPATIBLE_MODEL=gemma4:31b-it-qat`, lease 21500); `qwen3:14b` preview only. If a real-UI stall recurs: the same model at Q6_K (≈ 22 GB). Ollama's library has no q6_K tag for `qwen3.6:27b` (it lists q4_K_M 17 GB, q8_0, nvfp4, mxfp8, bf16), so the Q6_K comes from a Hugging Face GGUF (`ollama pull hf.co/<publisher>/Qwen3.6-27B-GGUF:Q6_K`; publisher and licence checked at download time); the in-library step down is `qwen3.6:27b-q4_K_M`. **Not downloaded** until a stall happens in real use |

**The switch** (done by the coordinator after the real-UI test): in the live `.env`,
`OPENAI_COMPATIBLE_MODEL=qwen3.6:27b-q8_0` (the line now reads `gemma4:31b-it-qat`; removing it gives the same, it is the
code default), then restart the worker and the web server. Nothing else changes: num_ctx 16384, KV q8_0, thinking off.

### 11.2 What the measurements found in the app (fixed)

1. **Thinking was never off.** Ollama 0.35.1's OpenAI-compatible endpoint ignores a top-level `think`; both Gemma 4 and
   Qwen3.6 have "thinking: default true". Measured on the same 120-token JSON request: qwen3.6 with `think: false` —
   71 s, 1,200 tokens, 4,621 reasoning characters, the answer cut; with `reasoning_effort: "none"` — 3.6 s, 114 tokens,
   0 reasoning (native `/api/chat` `think: false`: 0 for both models). Gemma's recorded answers ran 0.6–2 characters per
   token where JSON runs 3–4: in production it reasoned and spent max_tokens on it — the likely root of the 2026-10-05
   Arabic shot-plan truncation. Fix: `reasoning_effort: "none"` on every local call (ddd32d2f), a warning when a local
   answer still carries reasoning.
2. **Explicit reasoning, opt-in** (18070a07): `LlmOptions.reasoning` + `reasoningTokens` (default 4096 on top of the
   answer budget, inside the context's room; the call's deadline includes it). Off unless a stage asks. Not yet measured
   whether reasoning-ON is materially better on the same inputs (the comparison round was stopped); the reference arm
   with reasoning on (Gemma, below) exists.
3. **Long local answers stream** (c6ec1492): Node's fetch gave up after 300 s waiting for headers; the deadline is now
   5 min + 0.25 s per budgeted token.
4. **PLAN_SHOTS deadline scales with the work** (15277fa6): target scenes × their most answer tokens × parts, at the
   model's measured speed, ×2 + 10 min, 60 min … 8 h (an 11-scene 8-minute episode on Qwen3.6 ≈ 3.7 h of deadline).
5. **The VRAM edge fails fast** (this commit): Qwen3.6 Q8 fills the card; once (14:3x, 32.0 of 32.6 GB, 0–2 % GPU
   utilisation — Windows had paged the weights to shared memory) a call crawled for 15 minutes without an error. A stream
   with no token for 240 s, or fewer than 90 tokens in 90 s once writing, is now aborted as `LocalModelStalled`
   (`UNAVAILABLE`, failure class **RESOURCE_EXHAUSTION**, retryable), and the model is unloaded so the retry loads it onto a
   card with room. Recurring stalls in real use → the Q6_K build of the same model (§11.1, Fallbacks).
6. Docker: the `llm`/`llm-pull` containers trust the extra root (EXTRA_CA_FILE, Norton) at run time (13e1332b).

### 11.3 The benchmark as far as it ran

Same inputs for every model: a synthetic show around "The Static Sky" with a planted World Bible (Elias's LEFT palm
bandaged, he never goes on the water, the radio only hears the Mariner while meteors fall, two open storylines); an
8-minute episode 2 "The Harbour Office" from a fixed brief → `developStory` (scene breakdown) → **fixed** breakdown →
`writeScript` (11 scenes in one call) → **fixed** script → `planShotsDraft` + `fitDurations` for all 11 scenes in order,
each continuing from the last shot of the one before (as PLAN_SHOTS does); the Continuity Writer's record of episode 1;
the next-episode proposal inside the show; a two-singer music video's singing plan; two character designs; the §3
English scene and the §6 Iraqi Arabic scene. Fixtures frozen from Gemma's run 1.

**Gemma 4 31B, thinking ON (the accidental production mode — reference arm):**

| Task | Valid without repair | Time | Notes |
|---|---|---|---|
| develop (11 scenes) | 0/1 (1 repair: a lighting enum) | 201 s | 420 s planned of 480; World Bible respected |
| script (11 scenes, 41 beats, 18 lines) | 1/1 | 97 s | good, terse dialogue; "Ruth Moore" speaks from the radio (not a cast member) |
| shot plans, 11 scenes | 10/11, 0 cut | median 170 s/scene (2 parts each), 34.5 min | 89 shots, 474 s, every line once; 0 continuous boundaries; 1/30 screen-direction flips; bandage side named once (left, correct); the direction look repeated in 57/89 prompts although the studio prepends it |
| continuity record | 1/1 | 31 s | left palm correct, both open storylines kept |
| next episode | 0/1 (1 repair) | 112 s | picks up the logbook, Elias stays ashore; invents a harbour master "Arthur" |
| singing plan / designs / §3 / §6 | 4/5 | 25–216 s | §6 Arabic plan valid, 0 truncations |

Card ≈ 21.8 GB; 50–56 tok/s writing. (Some card peaks in the evidence read 32.0 GB: other families' engines were
resident during those calls before the machine-wide lease — not Gemma's footprint.)

**Qwen3.6-27B, thinking OFF:** development valid on the first call (above). The rest of the round was stopped by the
directive; the real-UI planning run is the proof.

**Scoring rubric** (for the real-UI run and any later comparison; 0–5 each, read by hand): story craft (structure, scene
purpose, dialogue), World Bible fidelity (the planted facts), shot-plan craft (timed beats, motivated framing, concrete
name-free prompts, the prefix not repeated), continuity across scenes (names, wardrobe, props, 180°, time of day),
Arabic (dialect, spelling) — plus the mechanical counts the report prints.

## 10. Qwen3.8-27B-FP8 as the production planner (Phase 1, 2026-10-06) — WIP, integration moved to a new session

**Status when this session stopped (producer order):** the pinned weights were downloading; no image pulled, no server
started, no GPU used, nothing measured. Everything below is code and configuration, unit-tested, not yet run against a
real vLLM server.

- **Weights:** manifest group `llm-qwen3.8-27b-fp8` (docker/models/manifest.json): `Qwen/Qwen3.8-27B-FP8` @
  `017b9c7af6b5689d5dd426a76e0bc077eb5ca20a`, 79 files, 30,890,048,027 bytes, sha256 per file (LFS oids from the HF API;
  the small files hashed after a download at that revision), folder `llm/qwen3.8-27b-fp8` on the store. Apache-2.0 (card
  and LICENSE), not gated. `mtp.safetensors` is the multi-token-prediction head.
- **Runtime (not yet run):** compose service `llm-vllm`, `vllm/vllm-openai:v0.31.0` (to be pinned by digest after the
  pull), the store mounted read-only, `HF_HUB_OFFLINE=1`/`TRANSFORMERS_OFFLINE=1`, kernel caches on the store
  (`cache/vllm`, a subpath that must exist before the first start), `--max-model-len 16384 --gpu-memory-utilization 0.96
  --kv-cache-dtype fp8 --enforce-eager --max-num-seqs 2 --reasoning-parser qwen3 --enable-sleep-mode
  --default-chat-template-kwargs {"enable_thinking":false}`, vision kept (`--limit-mm-per-prompt {"image":2,"video":0}`),
  port 127.0.0.1:8050. The vLLM recipe says a single RTX 5090 needs `--enforce-eager` (CUDA graphs OOM) and FP8 skips
  DeepGemm on sm_120. **Fit is unmeasured**: 28.8 GiB of weights on a 31.4 GiB usable card leaves ≈ 2.5 GiB for the FP8 KV
  cache (≈ 32 KB/token: 16 attention layers × 4 KV heads × 256 × 2) and activations — 16K context should fit; if not,
  try `--language-model-only`, a lower max-model-len, then stop and report before any 4-bit build.
- **Provider:** `OPENAI_COMPATIBLE_RUNTIME` vllm|ollama|remote (empty = from the URL), `LLM_CONTEXT_LENGTH`; on vLLM the
  request sends `chat_template_kwargs.enable_thinking` (false unless a stage asks; the per-stage reasoning option maps to
  true with its token budget) and the card's sampling (non-thinking top_p 0.8, top_k 20, presence 1.5 at the stage's
  temperature; thinking 1.0/0.95/20/0), never Ollama's fields; `max_tokens` is capped at the context's room (vLLM refuses
  past --max-model-len); `reasoning_content` is read; streaming and stall detection unchanged.
- **GPU lease:** the `vllm` unloader sleeps the server at level 2 (weights and cache out of VRAM, nothing parked in host
  RAM); `chat()` wakes it inside its lease (`/wake_up?tags=weights` → `/collective_rpc reload_weights` →
  `/wake_up?tags=kv_cache`), a failed wake = retryable INFRASTRUCTURE. Wake time and the VRAM left after sleep (CUDA
  context) are unmeasured: if H3 does not fit beside a sleeping vLLM, stop/start the container instead.
- **Defaults:** `DEFAULT_LOCAL_LLM = Qwen3.8-27B-FP8`, compose app env → `http://llm-vllm:8000/v1`, runtime vllm; the
  host `.env.local` needs `OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:8050/v1`. Ollama `llm` moved under profile
  `fallback` (Gemma 4 31B emergency fallback only, explicit switch). Lease estimate and speed for `qwen3.8-27b` are
  placeholders (31500 MB, 25 tok/s) until measured.
- **UI/records:** Settings › Engines and the engine room show "Qwen3.8-27B-FP8" (and "asleep" when it sleeps);
  licences: Qwen3.8 in use (Apache-2.0), Gemma fallback; registry row with the checkpoint; resume-local: the store size
  check now covers `llm/qwen3.8-27b-fp8`, a `planner` step starts llm-vllm, checks `/v1/models`, sleeps it.
- **Still to do:** pull and pin the image; create `cache/vllm` on the store; start, measure fit/VRAM/RAM/load time/wake
  time; set the real lease estimate and speed; run `scripts/planner-focused-test.ts` (concept → outline → scene → 3 shots
  through the engine, plus one image+text request with `--image var/library/image/2026/10/gen-f90820998a.png`, Najm);
  the GPU-STAGING row; the promotion record; the real-UI test.