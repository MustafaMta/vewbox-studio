---
name: h3-prompting
description: How to write a MiniMax H3 request for one shot — prompt grammar, the <d> dialogue tags, first-frame versus reference-to-video, guides for continuation and recorded sound, the frame grid and step counts. Use when building or reviewing a video.minimax_generate call.
license: Proprietary to this studio; grammar after lumosai8/MinimaxStoryBuilder (MIT) and Comfy-Org/docs (MIT)
allowed-tools: video.minimax_generate media.probe media.qa_take
metadata:
  version: "1.2.0"
  source: this studio, verified on ComfyUI 0.38.1 with MiniMax-H3 fl2va/ref2va int8 (docs/AUDIOVISUAL-QA.md E0–E2c)
  models: MiniMax-H3 (local), MiniMax Hailuo hosted API
---

# MiniMax H3 prompting

MiniMax is the only video engine. Everything below was measured on this machine; see `docs/AUDIOVISUAL-QA.md`.

## The request, in order

1. **Pictures.** A drawn opening frame → first-frame graph (`fl2va`). No usable frame → reference-to-video (`ref2va`)
   with the opening frame as a reference picture (if one exists), then each character's portrait, then the location
   plate. Never a bundled sample picture or an SVG. Limit 9 pictures, 3 audio references.
2. **Words.** The exact script lines go inside `<d>…</d>` tags in the prompt, one tag per line in order:
   `<d>[Arabic] هسه وين نروح؟</d>`. H3 speaks what the tags say; a paraphrase in the prose does not change the words.
   The planner's own tags are stripped and the script lines appended by `takePrompt` — do not write tags by hand.
3. **Sound.** The model always renders its own audio. Audio keyframes (`MiniMaxH3AddGuide`) and `ref_audios` are
   conditioning rows, never copied into the output (verified in `comfy/ldm/minimax/model.py`). A recorded line placed
   as a guide at the shot's first speaking frame shapes timing and timbre; the words still come from the tags.
4. **Guides.** Guide clips are 22 frames. A continuation shot gets the previous take's last 22 frames as a video
   guide at frame 0 and those frames are dropped in the cut (`trimStartFrames = 22`).
5. **Length.** Frames are `17k + 5` at 24 fps; 4–15 s. A speaking shot is cut to what its words need plus up to 2 s:
   H3 fills silence by repeating a short line (E2a: a 1.8 s line in a 6 s clip was said twice).
6. **Steps.** 8 steps (turbo LoRA) gives the weakest audio; 12+ recommended when speech matters. int8 attention can
   morph faces near the end of a clip; the Visual Quality Inspector treats it as `OUTPUT_CORRUPTION`.

## Prompt grammar (six parts, one paragraph)

Style words first (the production direction), then the place, then the people by appearance (never by name),
then the action, then the camera, then the sound (ambience; who speaks). Short sentences. Nothing the picture
cannot show.

## What fails preflight

No identity reference for a shot with characters (`MISSING_REFERENCE`); more than 9 pictures or 3 audio references
(`UNSUPPORTED_CAPABILITY`); a speaking shot whose speaker has no voice recording (`MISSING_REFERENCE`); a continuation
whose previous shot has no accepted take (`INCONSISTENT_PLAN`); an empty action and prompt (`PROMPT_AMBIGUITY`).
