# MiniMax P1 experiments — E4 / E6 subset, continuation (P0.2) and an E3 subset

Run 2026-10-03 straight through ComfyUI v0.38.1 (local MiniMax H3, pruned int8, RTX 5090) with the studio's own
builders (`minimaxH3Video`, `h3ReferencePrompt`, `takePrompt`, `tailClip`), by `scripts/minimax-p1-experiments.ts`;
join metrics by `scripts/minimax-join-metrics.mjs`. The speech services were unloaded first; no worker job ran.
Every clip is 5 s → 124 frames (continuations 5 s + 22 guide frames → 158), 1280×736, seed 1164088642 (+1 for the
continuations). Inputs (`inputs/`): a canonical front full-body test image (photoreal pharmacist), a pharmacy
master plate drawn with Qwen-Image-2512, and an opening frame drawn with Qwen-Image-Edit-2511 from the plate and the
character (the studio's `framePrompt`). Per clip: `<id>.mp4` (640 px proxy), `<id>-sheet.jpg` (every 6th frame),
`stills/<id>-fNNN.jpg`, `<id>.graph.json` (the exact graph); `results.json` holds the exact prompts, timings and
the transcription of every clip by the studio's ASR (faster-whisper large-v3, take gate). Originals:
`var/exp/minimax-p1/` (not committed). Identity was judged by eye (no face-similarity model is wired):
`identity-board.jpg` = canonical | E4a | E4b | E4c | E6b | C1 at frame 110.

| id | setup | engine | heard (take gate) | picture / identity |
|---|---|---|---|---|
| E4a | FL2VA, drawn opening frame as first frame, plain prompt, 8-step turbo | 156 s¹ | line, CER 0.07 ("10" for "ten") — pass | starts on the frame, she turns, takes a box, speaks; wardrobe, glasses, badge, watch kept; face small in a wide frame |
| E4b | **P1 default**: Ref2VA, canonical image `<Picture 1>` = `<Subject 1>`, plate `<Picture 2>` = `<Subject 2>`, opening frame `<Picture 3>` + AddGuide at 0; six-section grammar; 4-step turbo, simple | 124 s¹ | line, CER 0.07 — pass | same composition and action as E4a, no visible difference in identity at this framing; clean motion |
| E4c | Ref2VA, canonical image + plate only (no opening frame anywhere) | 69 s | line, CER 0.07 — pass | the model frames its own medium shot; the strongest visible identity match (face, glasses, greying bun with flyaways, burgundy blouse, badge, watch); the place partially kept (shelves, lamp, window and street, register; the green cross dimmed) |
| E6a | E4b with the **beta** scheduler (4-step turbo) | 76 s | "We're closing time out, so take your time." CER 0.53 — **fail** | **severe ghosting**: a translucent, doubled figure and smeared faces for ~2 s — beta does not suit the 4-step turbo LoRA |
| E6b | E4b without the turbo LoRA, 12 steps, beta | 186 s | line, CER 0.07 — pass | best face detail and identity, but the single-frame opening anchor held only frames 0–1, then a **hard cut** to a close-up (`E6b-first8-strip.jpg`): the anchor lost to the prompt's "medium" framing |
| C1 | **P0.2**: Ref2VA continuation of E4b — E4b's last 22 frames **and their sound** in one AddGuide at 0 (GetVideoComponents audio wired), canonical image + plate re-applied, shot without lines | 125 s | from frame 22: "Talk with her, Patrick. Do you need her?" — **invented speech** | graph runs; head re-rendered at PSNR 38.7 dB / SSIM 0.98 vs E4b's tail; join (E4b last → C1 frame 22) PSNR 37.6 dB ≥ intra-shot 5th percentile 35.8 dB → pass; audio at the join −53.4 → −52.1 dBFS (`C1-join-metrics.json`, `C1-join-strip.jpg`) |
| C1b | C1 with "Nobody speaks in this shot" / "no dialogue and no voices" in the prompt | 170 s¹ | from frame 22: "take what you need. See you, Madhya." — still speech | picture ≈ C1; join the same (`C1b-join-metrics.json`) |
| C1c | **E3 subset**: C1b with the tail **frames only** (no tail sound) | 162 s¹ | from frame 22: nothing (silent) | picture join the same (PSNR 37.6 dB); head audio −31 dBFS instead of the re-rendered speech (−19.6) (`C1c-join-metrics.json`) |

¹ includes a model load (ComfyUI's models were freed before the run, or another session's models were resident);
E4c/E6a are warm Ref2VA runs. Timings are not a clean speed comparison.

## What this decides (one seed each — directional, not statistics)

- **Ref2VA for every shot with a character or a place (P1 default) stays**: with the opening frame bound and anchored
  it reproduces the FL2VA result (same composition, same speech accuracy) while the canonical image and plate ride
  along; without an opening frame it gives the strongest identity. FL2VA keeps reference-free shots.
- **The 4-step turbo LoRA with the `simple` scheduler stays the default.** `beta` + turbo is broken (E6a); the
  template's "beta outperforms simple" note is about 20-step sampling. 12 steps without LoRA looks best but cost
  1.5–2.5× and broke the single-frame opening anchor (E6b) — not a default; a candidate only for close-ups without an
  anchored opening frame, after more seeds.
- **Grammar**: `<Picture i>` is bound by connection order (verified in `comfy/text_encoders/minimax.py`: each connected
  picture is prefixed `<Picture i>: `); `<Subject k> is the … in <Picture k>`, `[keyframe completion + reference
  generation]`, `retention_analysis` and `<Subject k> (S1) says, <d>[English] …</d>` produced the scripted line
  verbatim in every pass case. The drawn opening frame and the prompt's framing must agree (E6b).
- **Continuation audio (P0.2) works mechanically, with one measured exception now encoded**: anchoring the tail's
  sound into a shot WITHOUT lines made H3 keep talking (C1, C1b); frames only kept it silent (C1c), with the same
  picture join. The shot pack therefore anchors the tail without its sound when the previous take speaks in its
  last 22 frames and the new shot has no lines (`speechInTail`); every other continuation carries the sound.
- **Operational**: switching FL2VA → Ref2VA with the speech services still holding ~22 GB of host RAM after their
  GPU unload got ComfyUI OOM-killed (`docker events`: oom, exit 137, restarted by its policy) during the first E4b
  attempt. `generateVideo` now frees ComfyUI's models before switching H3 checkpoints; the speech services' unload
  keeps their weights in host RAM (tts-design 9.1 GB, tts 8.1 GB, asr 3.5 GB measured) — worth fixing separately.
