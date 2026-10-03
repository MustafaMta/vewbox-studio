---
name: h3-prompting
description: How the studio writes a MiniMax H3 request for one shot — prompt grammar, the dialogue tags that carry the exact script lines, first-frame versus reference-to-video, guides for continuation and recorded sound, the frame grid and step counts, and what the preflight refuses. Implemented by the take handler, its preflight and the H3 workflow.
license: Proprietary to this studio; grammar after lumosai8/MinimaxStoryBuilder (MIT) and Comfy-Org/docs (MIT)
allowed-tools: video.minimax_generate
metadata:
  version: "1.3.0"
  kind: "PROCEDURE"
  source: this studio, verified on ComfyUI 0.38.1 with MiniMax-H3 fl2va/ref2va int8 (docs/AUDIOVISUAL-QA.md E0–E2c, docs/research/MINIMAX-CONTINUITY.md, docs/evidence/minimax-p1)
  models: MiniMax-H3 (local), MiniMax Hailuo hosted API
---

# MiniMax H3 prompting

MiniMax is the only video engine. Everything below was verified on this machine (ComfyUI v0.38.1 source, the
installed templates, measured runs); see `docs/research/MINIMAX-CONTINUITY.md` and `docs/AUDIOVISUAL-QA.md`.
The shot pack (`src/server/production/shot-pack.ts`) decides the request; preflight judges that same pack.

## The request, by the shot's relation to the previous one

- **CONTINUATION** (same action, same scene): the previous take's last 22 frames **and their sound** in one
  `MiniMaxH3AddGuide` at frame 0 (a music video: the song under those frames); no opening frame; the recorded line at
  frame 22; the cut drops the 22 frames and their sound (`trimStartFrames = 22`). Hosted: the previous take's last
  frame becomes the first frame (no references in frame mode).
- **CUT** (same moment, new angle): the drawn opening frame (drawn with the previous shot's state) anchored at 0 and
  bound as a picture; an ending frame at −1.
- **STORY_TRANSITION**: the destination's plate and its own opening frame; nothing from the previous shot.

## Pictures — identity on every shot

Every shot with a character or a place runs on the reference graph (`ref2va`): each character's **canonical front
full-body image** (`primaryImageOf`) in the shot's order, then the plate for the scene's time of day (STATE, else
MASTER), then the drawn opening frame (a production asset, never an identity). At most 9 pictures (the place keeps
its slot; characters beyond the budget are named in a warning), 3 audio references, 4 guides. `fl2va` only for
reference-free shots. Never a bundled sample picture or an SVG. Hosted: reference mode or frame mode, never both.

## Prompt grammar (Ref2VA)

The installed multiframe template's and MiniMax-H3 `skills/h3-prompt-writing` sections, in order: `subject_definitions:`
(`<Subject 1> is the 45-year-old woman in <Picture 1>, featuring …`; `<Subject 3> is the interior environment in
<Picture 3>, featuring …`; `<Picture 4> is the first frame of [Shot 1], …`; `<Audio 1> is the voice-timbre reference
for <Subject 1> (S1).`), `summary:` with the task type (`[reference generation]`, `+ keyframe completion` when
something is anchored, `+ audio reference` with timbre clips), `retention_analysis:` (subjects `fully_preserved`,
the place `partially_preserved`, the first frame `fully_preserved`, timbre `reference`), `detailed_description:`
(style first, `[Shot 1]`, the shot's own direction, its continuity state, the lines), `overall_soundscape:`,
`non_diegetic_music:` (N/A). `<Picture i>` is the i-th connected picture (the tokenizer prefixes each one); people
are described, never named. `lintH3Prompt` refuses a prompt that names an unconnected picture, leaves a connected
one unnamed, uses an undefined subject, or does not carry every script line exactly as often as the script says it.

## Words and sound

1. The exact script lines go inside `<d>…</d>` tags, spoken by their bound subject:
   `<Subject 1> (S1) says, <d>[Arabic] هسه وين نروح؟</d>`. The planner writes no tags; `stripDialogueTags` removes a
   tag and only the speaker label right before it.
2. The model always renders its own audio. Guides and `ref_audios` are conditioning, never copied into the output
   (`comfy/ldm/minimax/model.py`). The recorded line at the shot's first new frame shapes timing and timbre.
3. Speech is checked by transcription from the first new frame (a continuation's head is the previous shot's).

## Length and steps

Frames snap **up** to `17k + 5` at 24 fps and stay inside the trained 124–362 frames (5.17–15.08 s); a continuation
adds its 22 guide frames, so it carries at most 340 new frames. A speaking shot is cut to its words plus up to 2 s
(above the 124-frame floor). Ref2VA: 4-step turbo LoRA by default; the scheduler and steps are parameters.

## What fails preflight

No canonical image for a character in the shot (`MISSING_REFERENCE`); more than 9 pictures, 3 audio references or
4 guides (`UNSUPPORTED_CAPABILITY`); a guide that does not fit the clip (`WRONG_PARAMETERS`); a speaking shot whose
speaker has no voice recording (`MISSING_REFERENCE`); a continuation whose previous shot has no accepted take
(`INCONSISTENT_PLAN`); an empty action and prompt (`PROMPT_AMBIGUITY`). The take handler also refuses a prompt that
fails its lint (`PROMPT_AMBIGUITY`) and the hosted API refuses anything it would have to drop.
