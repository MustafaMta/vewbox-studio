# D13 — identity-line wording, real GPU check (2026-10-03)

Straight through ComfyUI on the RTX 5090, not through the shared worker: no studio job active, ComfyUI queue empty,
TTS / Habibi / voice-design / ASR unloaded with `POST /unload` first. Driver: `run.ts` (phases `lines`, `secondary`,
`variants`, `variants2`, `judge`); every prompt, negative, seed, time and framing result is in `results.json`; the
pictures here are JPEG copies (PNG originals in the worktree's `var/image-v2/d13/`, gitignored).

Subject: the A3 character أبو سلام (`char-bc112248bf`, Realistic), read from the database (`a3-record.json`); its
approved canonical image v2 is `gen-655c17f72b` (`a3-canonical.json`: size and the framing box). Graph for every
canonical draw: Qwen-Image-2512, quality mode (30 steps, cfg 4), 928×1664, `canonicalPrompt` + `negativeFor`, the
image's seed 1374230458 (s0) and the next (s1). Mid-way ComfyUI was recreated from the rebuilt image; the driver's
prompt was resubmitted (one cold load, 60 s).

## Lines compared

- **old** — the line stored with the approved image (the builder before this change): "…; long, weathered face with
  deep vertical lines from smiling; thick, gray mustache; faint creases … stories untold face; … wearing shimmering
  grayish-blue cotton deshdasha …; baggy black cotton trousers …".
- **new** — `canonicalIdentityLine` now: the facial hair stated on its own ("facial hair: thick, gray mustache only; the
  chin, jaw and cheeks are shaved smooth" — an earlier run said "…, clean-shaven chin, jaw and cheeks, no beard"), the
  garment's cut ("ankle-length deshdasha (a loose robe reaching down to the ankles)", "the trousers are worn under the
  robe and show only at the ankles"), long fields labelled ("eyes: dark brown, sharp but kind, …") instead of
  "…never fades eyes".

## What the pictures show (my look at every picture; hem = robe hem as a share of the figure's height, head = 0)

| Picture | Line / negative | Facial hair | Robe hem | Trousers | Other |
|---|---|---|---|---|---|
| `old-line-s0` | old | full beard | mid-thigh (≈ 69 %) | whole lower leg | — |
| `old-line-s1` | old | full beard | mid-thigh (≈ 71 %) | whole lower leg | — |
| `new-line-s0` | new (first wording) | full beard | below the knee (≈ 81 %) | calf down | — |
| `new-line-s1` | new (first wording) | full beard | mid-calf (≈ 85 %) | ankles and shins | — |
| `new-neg-s0/s1` | new + "beard, full beard, chin beard, goatee, stubble, short/knee-length/thigh-length tunic, kurta" | full beard (2/2) | ≈ 81 % / ≈ 85 % | calf down | the face turned European in 2/2 (the "kurta" word) |
| `front-neg-s0/s1` | the same, facial hair and robe statements moved right after the age | full beard (2/2) | ≈ 81 % / ≈ 85 % | calf down | face European again (2/2) |
| `final-s0/s1` | new as shipped ("shaved smooth", no "beard" word in the prompt), standard negative | full beard (2/2) | ≈ 81 % / ≈ 85 % | calf down | the face as in the old draws |

Qwen3.5-4B's reading of the same pictures (`judge` in `results.json`) agrees on the facial hair (beard and moustache in
every picture) but says "robe at the ankles or floor" even for the mid-thigh tunics, so it is no measure of the robe
length; the hem column is my reading of the pictures.

**Result.** The cut wording measurably lengthens the robe: mid-thigh in 2/2 old draws, below the knee to mid-calf in
8/8 draws with the new line (same seeds) — better, but still not ankle-length, and the trousers stay visible from the
calf. The facial-hair wording does **not** change the picture: a full beard in 8/8 draws with the new line (and 2/2 old), whatever the wording, with
the beard words in the negative (cfg 4) and with the statements moved to the front. For this record (an old man with
long silver hair in a knot) the model's prior wins; it is a model limitation, not a wording one. Shipped: the clearer
line (it states what the design means and lengthens the robe); not shipped: the extra negative words and the
reordering (no measured effect; "kurta" in the negative changed the face). Next candidates: a reference-based route
(Image Reference from a picture with a moustache only), a facial-hair LoRA, or klein/FLUX for text (the FLUX-vs-Qwen
study kept Qwen for text on other grounds).

## Secondary material (C1) on the same character, from `gen-655c17f72b`

One Edit-2511 pass each (quality, 24 steps, cfg 4), the canonical image as the only reference:

| Picture | Engine time | Card peak | Result |
|---|---|---|---|
| `secondary-expression` (1280×1280) | 80.4 s | 31.3 GB | a clean 2×2 sheet — joy, worry, a stern look, surprise — the same face, glasses, top knot and cardigan in all four |
| `secondary-outfit` (928×1664) | 67.3 s | 31.9 GB | the whole figure with the same garments; close to the canonical image itself (the robe redrawn tunic-length, as in the source) |
| `secondary-portrait` (1024×1280, first version) | 60.1 s | 31.7 GB | **failed**: a whole figure, not a close-up |
| `secondary-portrait-crop` (head-and-shoulders crop of the canonical image, same prompt) | 70.8 s | 31.2 GB | **failed** again: a whole figure (the prompt still listed every garment and the slippers) |
| `secondary-portrait-final` (crop + the close-up prompt without the garments) | 112.2 s (slower: the card was busier after the ComfyUI recreation; the canonical draws of that run took 73–90 s instead of 42 s) | 31.5 GB | a head-and-shoulders portrait of the same man (glasses, top knot, cardigan, robe collar) |

Shipped for the portrait: `portraitCrop` (the head and shoulders from the framing box recorded with the canonical
image, 4:5) and a close-up prompt that keeps the head and leaves out the garments. For comparison, the removed
four-view sheet path took two runs and 140 s for the sheet alone.
