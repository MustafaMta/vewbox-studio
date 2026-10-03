# MiniMax continuity — capabilities, current pipeline, continuation design, World Bible, audio timeline

Research for directive Parts 7, 8, 10 and 11. Read-only investigation, 2026-10-03. No code was changed.

**Evidence levels used below.** **SRC** = read in the installed source (ComfyUI v0.38.1 inside `vewbox-comfyui-1`,
`/opt/comfyui`, and `comfyui_workflow_templates` 0.11.73 in `/opt/venv`); **OI** = ComfyUI `/object_info` on
127.0.0.1:8188; **DB** = the Phase-0 backup `var/backups/phase0-cleanup-20261002-2347/database.dump` (the live DB is
empty since the cleanup; the acceptance runs "The Lamp Shop" and "بيت أبو كريم" are in the dump); **REPO** = this
repository at file:line; **UP** = upstream web sources (§1.6); **UNTESTED** = a design hypothesis that needs the named
experiment before it becomes a default.

---

## 0. Findings in one page

1. **Every H3 conditioning input is in-context, never pinned.** First/last frames, `MiniMaxH3AddGuide` images/clips/audio
   and all `ReferenceToVideo` media become *condition rows* in the packed sequence with `img_update/audio_update = False`;
   the target video and audio are always fully generated (SRC `comfy/ldm/minimax/model.py:373-394, 441-453, 704-713`).
   Guides placed on the target timeline (AddGuide, first/last frame) share RoPE time positions with the frames they
   anchor and are reproduced closely; references (`ref_*`) sit *before* the target timeline and are semantic only.
   The repo comment "the output contains them exactly" (`src/server/workflows/minimax-h3.ts:15-18`) is wrong for
   both frames and audio; the audio half was already established by E1 (`docs/AUDIOVISUAL-QA.md:29`).
2. **Reference-to-video and guides are designed to be combined.** `extra_conds` merges `minimax_keyframes` and
   `minimax_refs` into one payload (SRC `comfy/model_base.py:2199-2207`), and the official
   `video_minimax_h3_multiframe_reference` template chains three AddGuides onto a `MiniMaxH3ReferenceToVideo`. Its
   note (and the AddGuide PR #15439) names the continuation idiom: a 22-frame clip *plus its audio* in one AddGuide
   at `frame_idx` 0 "to continue both streams". MinimaxStoryBuilder shipped that join and then removed it from its
   code (drift / stutter at the join), so the studio must measure its joins rather than assume them (§3.6, E3/E5/E11).
3. **The studio's continuation drops the audio half.** The tail clip is cut with sound (`src/server/media/ffmpeg.ts:139-146`)
   but the graph wires only `GetVideoComponents.images` (`minimax-h3.ts:81`) and the take passes no `audioFile`
   (`src/worker/handlers/take.ts:160`). DB: all 4 continuation takes record `guides[0] = {video: true, audio: false}`.
   `IMPLEMENTATION-CHECKLIST.md` rows 13.5 and 14.9 ("22 frames + audio/sound") overstate what ran.
4. **Canonical references are absent from 23 of 27 real takes.** A shot with a drawn opening frame goes to FL2VA
   (first frame only) and gets no character or location reference (`take.ts:184`); only continuation shots (4/27, DB)
   used Ref2VA with the canonical images. Identity therefore rests on the Qwen-Image-Edit opening frame, which is
   regenerated per shot. This contradicts the directive (reapply approved references on every shot) and the studio's
   own skill text (`skills/world-continuity/SKILL.md` "the canonical image and plates on every shot").
5. **No reference is bound in the prompt.** H3's Ref2VA grammar binds media by `<Picture i>` / `<Subject N>` /
   `<Audio j>` (SRC tokenizer `comfy/text_encoders/minimax.py:169-191`; template prompt `subject_definitions:` …
   `retention_analysis:`); `takePrompt` never emits a tag (`src/server/story/prompts.ts:52-68`, grep: no `<Picture`
   anywhere in `src/`). With four pictures the model is not told which is whom or which is the place.
6. **Frame-count port bug.** `h3FrameCount` uses JS `%` on a negative number and snaps *down* by up to 11 frames for
   4, 6, 7, 9, 11, 12, 13, 14 s (`minimax-h3.ts:10-13`); the node and template snap *up*
   (`nodes_minimax_h3.py:38-41`, template expression `(5 - (n % 17)) % 17` in Python). DB: 9 s shots came back
   8.708 s (209 frames), 11 s shots 10.833 s (260). A 4 s request is 90 frames, below the 124–362 trained range.
7. **Prompt-sanitiser bug deletes picture direction.** The regex that strips planner `<d>` tags also eats up to 80
   characters before each tag (`prompts.ts:66`). DB, Lamp Shop shot 1.2: planner text "Left: tall man slumps on
   counter, hand on parcel. Warm morning light …" became "Left: tall man s (34-year-old woman, Petite) <d>…".
8. **The continuation chain is not tracked.** A continuation take keeps the predecessor's asset only as a `VIDEO`
   reference note (`take.ts:162`); nothing compares it with the predecessor's current choice, so a re-selected
   predecessor leaves a stale join; the speech check also transcribes the guide head (`take.ts:237`).
9. **The final dialogue is MiniMax's voice, not the character's.** The recorded line is only a guide; the cut plays
   the take's own audio (`src/server/media/assembly.ts:81`). Voice identity across shots is therefore not controlled
   and not measured.
10. **The cut timeline is derived from take lengths, not authoritative.** `buildTimeline` sums take durations
    (`assembly.ts:30-46`); a music video's song windows come from *planned* durations (`src/domain/timeline.ts:15-20`),
    so snapping and dialogue-length changes accumulate drift that the ±600 ms lag fix (`src/server/media/sync.ts`)
    cannot absorb. `transition` (DISSOLVE/FADE) is ignored by assembly; no fades at joins; AMBIENCE/FOLEY/SFX/
    LEAD_VOCAL/BACKING_VOCAL track kinds exist but are never produced.
11. **World Bible is strings on the show.** `Show.bible` is four unversioned string lists (`src/domain/types.ts:56`);
    shorts have none; a returning location reuses only `masterAssetId` (and the planner gets text, `engine.ts:327-335`).
    Per-shot continuity *is* versioned (`continuity_versions`, `src/server/studio/persist.ts:154`) — the pattern to extend.
12. **Hosted path is a different capability set.** No AddGuide, frame roles and reference roles cannot be mixed, guides
    are silently ignored by `generateVideo` (`src/server/providers/video.ts:52-92`); continuation there is
    "last frame as first frame" or a `reference_video`. The design below keeps one ShotPack and lowers it per backend.

---

## 1. Verified capability table — MiniMax H3 in ComfyUI 0.38.1 (local)

Installed: ComfyUI `v0.38.1` (`comfyui_version.py`), `comfyui_workflow_templates` 0.11.73. Weights present (OI
`/models/*`): `minimax_h3_fl2va_pruned_int8_convrot`, `minimax_h3_ref2va_pruned_int8_convrot`,
`qwen3vl_32b_minimax_h3_nvfp4_awq`, video VAE int8, audio VAE fp32, LoRAs `fl2v_turbo_8step_v1.0`,
`ref2v_turbo_4step_v0.1`. Not present: the FL2V 4-step LoRA, the bf16 DiTs, the 10 `minimaxh3_*` style embeddings,
any Fun-ControlNet `model_patches` (directory empty).

### 1.1 Nodes

| Node (module `comfy_extras.nodes_minimax_h3`) | Inputs (OI) | Limits / behaviour (SRC line) | What it conditions |
|---|---|---|---|
| `EmptyMiniMaxH3LatentAV` | width, height (step 32), length (5–3600, step 17) | `temporal_shape`: frames snapped **up** to 17k+5 (`:38-51`); video latent `[1,24,T,H/16,W/16]` with T = ((n−5)/17)·5+2; audio latent `[1,32,2,round(n/24·40)]` (40 Hz) (`:85-91`). Tooltip: trained range ≈124–362 frames, longer untested | nothing (empty AV latent) |
| `MiniMaxH3ImageToVideo` (t2va / fl2va) | clip, vae, prompt, width, height, length; optional `first_frame`, `last_frame` (IMAGE) | First frame resized by plain **stretch** (`"disabled"` crop) — an off-aspect frame is distorted (`:146-149`); last frame cover-cropped and anchored at `frame_count−1` (`:150-154`); **both also enter Qwen-VL** as `<Picture 1>`/`<Picture 2>` (`:156`, tokenizer `minimax.py:192-195`); keyframe latents → `minimax_keyframes` (`:159-162`). No audio input; no batch > 1 frame (only `[:1]`) | text + 1–2 keyframes on the target timeline |
| `MiniMaxH3AddGuide` | positive, latent, frame_idx (−9999…9999, negative from end); optional vae, audio_vae, image (IMAGE batch), audio (AUDIO) | Needs an H3 AV latent (`:193-194`) and image or audio (`:195-196`). Image batch: <5 frames → first frame only; else snapped **down** to 5, 22, 39 … (17k+5) (`:202-211`); must fit inside the clip (`:213-218`); frames cover-cropped to canvas (`:222`). Audio resampled to the VAE rate, encoded, **cropped to the clip's remaining duration** from frame_idx (`:225-235`). Appends to `minimax_keyframes` (`:237-239`). Output: CONDITIONING only (latent untouched) | a still, a clip, audio, or clip+audio at any frame of the **target timeline** |
| `MiniMaxH3ReferenceToVideo` (ref2va) | clip, prompt, width, height, length, `ref_image_size` (`match`/`max`); optional vae, audio_vae; autogrow `ref_images` (0–9), `ref_videos` (0–3), `ref_video_audios` (0–3, paired by index), `ref_audios` (0–3) | Images: `match` = scale down to the generation's pixel area, `max` = up to 2048 short edge, never up (`:297-312`). Videos: tooltip 24 fps, 2–15 s; code truncates to the target `frame_count`, needs ≥5 frames, snaps down to 17k+5 (`:315-333`); Qwen sees them at 2 fps with timestamps (`:337-341`); paired soundtrack gets its own `<Audio j>` label before `<Video k>` (`:334-336`). Standalone audio (`:352-358`). Without `vae`/`audio_vae` media condition only the text encoder (OI tooltips). Prompt must use `<Picture i>` / `<Video k>` / `<Audio j>` (node description) | identity, style, motion, camera, voice — **semantic**, positioned *before* the target timeline (`model.py:369-371`) |
| `MiniMaxH3SigmaShift` | model, shift_video (12), shift_audio (3) | Same values as the model's own defaults (`comfy/supported_models.py:969-972`) — the node is redundant at 12/3 | sampler schedule |
| `MiniMaxH3FunControlNetApply` | model, model_patch, vae, strength, start/end %, optional control_video, mask ("1 marks regions to regenerate"), source_video | Model patch for a Fun ControlNet / inpaint (`:411-621`); no patch file installed | pose/structure control; masked video regeneration |

### 1.2 What the DiT does with them (SRC `comfy/ldm/minimax/model.py`, `comfy/model_base.py`)

- Packed sequence `[text | cond rows | ref blocks | target audio | target video]` (`model.py:5-7, 351-471`).
- **Keyframes/guides** (first/last frame, AddGuide): condition rows placed at time `cursor + 5/3 · frame_idx`, the same
  RoPE time axis as the target frames, video at timestep ≥0.999 (`VISUAL_COND_TIMESTEP`), audio at 1.0
  (`model.py:30-33, 373-394, 633-638`); never updated (`img_update/audio_update = False`); the target rows are always
  generated (`:441-453, 704-713`). Consequence: an anchored clip is *re-rendered* very closely, not copied; anchored
  audio steers timing/prosody/timbre but the output audio is always new (E1/E2a).
- **Refs** occupy their own time span before the target (`model.py:369-371, 396-439`): they are not anchored to any
  output frame. A reference video is therefore context ("<Video 1> shows …"), not a continuation mechanism.
- **Both at once**: supported in code (`model_base.py:2199-2207` concatenates keyframe and ref latents) and used by the
  official multiframe template. Whether the *ref2va checkpoint + 4-step v0.1 LoRA* holds a 22-frame tail as well as
  fl2va does is **UNTESTED** (DB has 4 such takes, all accepted by automatic QA; no join measurement exists).
- **Exact preservation is possible in the model but not exposed.** `MiniMaxH3` implements per-token denoise masks for
  video and audio (`model_base.py:2250-2286`), so pixels/samples could be kept verbatim in the target, but no stock node
  writes frames into a nested AV latent (`ReplaceVideoLatentFrames` is not nested-aware, `nodes_latent.py:446-482`) and a
  plain `SetLatentNoiseMask` reaches the video stream only (`samplers.py:1298-1305` fills audio with ones). The only
  known recipe is a community masked-extension workflow attached to PR #15375 (not inspected; may need custom nodes).
  Not recommended as the default; evaluated as E11 because it is the one way to avoid a regenerated head entirely.
- **Text**: the prompt is raw text after the vision blocks (no chat template); special tokens `<d> </d> <|cutoff|>
  <|lyrics_start|> <|lyrics_end|> <|caption_start|> <|caption_end|>` (`text_encoders/minimax.py:32-34`); audio never
  enters Qwen (`:10`); practical prompt length is not limited by the tokenizer (`qwen3vl.py:151`, max_length 99999999).
- **Canvas**: native 768 short edge, area cap 768×1344, multiple of 32 (template note; `nodes_minimax_h3.py:30-35`).
  `ImageToVideo`/`ReferenceToVideo` do not enforce the cap; the studio does (`minimax-h3.ts:47-50`).

### 1.3 Official templates (installed, `comfyui_workflow_templates_json/templates/`)

| Template | Graph | Defaults that matter |
|---|---|---|
| `video_minimax_h3_i2v` / `…_i2v_continuation` / `…_t2v` | fl2va `MiniMaxH3ImageToVideo` (first/last optional) | 20 steps without LoRA; LoRA optional (8 steps); `res_multistep` / `simple`; length `max(5, round(s·24)) + (5 − n % 17) % 17` (Python → snaps **up**); no SigmaShift node. "i2v_continuation" is the plain i2v graph meant for "feed the closing frame" use, not a guide graph |
| `video_minimax_h3_r2v` | ref2va | 20 steps, LoRA (4 steps) off by default; note: `beta` or `normal` scheduler "tends to outperform `simple`" for reference-heavy prompts; ref2va is "very sensitive to prompt wording" — tags must match connection order |
| `video_minimax_h3_multiframe_reference` | ref2va + 3 × AddGuide at 1.5 s / 3 s / 5 s | Prompt grammar: `subject_definitions:` (`<Subject 1> is the woman in <Picture 1> …`; `<Picture 1> is the first frame of [Shot 1]`), `summary:` with a task tag (`[keyframe completion + reference generation]`), `retention_analysis:` (`fully_preserved` / `partially_preserved` per subject and picture), `detailed_description:` with `[Shot N]` and `At 00:01.500, the shot cuts to …`, `overall_soundscape:`, `non_diegetic_music:`. `<Picture N>` binds only to connected `ref_images`; AddGuide pictures are timeline anchors only unless also connected as refs. The first frame may be given as `<Picture 1>` plus a prompt sentence saying the video starts from it, without an AddGuide |

### 1.4 Hosted MiniMax H3 (no key on this machine — nothing here has produced media)

From OI (Comfy partner nodes `comfy_api_nodes.nodes_minimax`) and `docs/research/MINIMAX-API.md`:

| Mode | Limits | Notes |
|---|---|---|
| First/last frame (`MiniMax H3` 768P/2K, 4–15 s; `H3 Max`, `H3 Max Turbo` 480P/768P, 5–15 s) | first frame required, last optional; ratio follows the image | `ComfyCloudMiniMaxH3ImageToVideoNode` description: feed a clip's closing frame "and it continues the sequence" — the hosted continuation idiom is last-frame-as-first-frame |
| Reference (`H3`, `H3 Max`) | ≤9 images (`Image 1…`), ≤3 videos 2–15 s each, ≤3 audios 2–15 s each, 15 s total per kind; audio "cannot be used without a reference image or video"; `reference_detail` high/standard (Max) | frame roles and reference roles cannot be mixed (MINIMAX-API.md:30-31; Context-IR node tooltips) |
| Context IR (prompt enhancer) | same media as the generation, in the same order | output refers to media by position |
| Regenerate 768P → 2K | needs the unmodified 768P output, the exact prompt and the same inputs | a finishing pass, hosted only |

No AddGuide, no anchored audio, no extension endpoint in the node set; `src/server/providers/video.ts:52-92` silently
drops `req.guides` on the API path. Upstream detail is in §1.6.

### 1.5 Capability matrix — need → mechanism

| Need (directive) | Local H3 (verified mechanism) | Hosted H3 | Studio today |
|---|---|---|---|
| Identity from the approved canonical front full-body image | `ref_images` `<Picture i>` + `<Subject N>` binding + `retention_analysis` (`fully_preserved` identity) | `reference_image` "Image i" | only when no opening frame (4/27 takes); never bound in the prompt |
| Opening frame of a shot | `first_frame` (fl2va) **or** AddGuide image at 0 on ref2va **or** `<Picture 1>` "starts from" (template) | `first_frame` (no refs) | fl2va first frame |
| Continue from previous shot | AddGuide clip 5/22/39 frames **+ its audio** at 0, cropped by assembly | `first_frame` = previous last frame; or `reference_video` (context only) | AddGuide 22 frames, **no audio** |
| Hit a planned pose mid-shot / end state | AddGuide still at frame k / `last_frame` | `last_frame` (fl2va only) | `last_frame` only on fl2va; dropped when refs are used |
| Location identity | `ref_images` plate as `<Picture k>` ("the place"), `partially_preserved` (camera may differ) | `reference_image` | master plate only, only on ref2va takes |
| Previous shot as context for a new angle (editorial cut) | `ref_videos` + `ref_video_audios` (`<Video 1>`) | `reference_video` | not used |
| Authoritative dialogue timing | AddGuide audio at the speaking frame + exact `<d>` line; verify by ASR | not available (refs only) | yes (`take.ts:165`) |
| Voice timbre | `ref_audios` `<Audio j>` (semantic) and/or AddGuide audio | `reference_audio` (needs an image/video ref) | `ref_audios` only when no soundtrack |
| Exact audio in the output | **not supported** by stock nodes (generated stream); keep it in the mix instead | no | n/a |

### 1.6 Upstream (web, read 2026-10-03) — MinimaxStoryBuilder, MiniMax skills, ComfyUI master, MiniMax platform

**ComfyUI master** (tags v0.38.1 2026-09-30, v0.38.2 2026-10-02): `comfy_extras/nodes_minimax_h3.py` unchanged since
v0.38.1 (last change #16471, Union ControlNet 2.0, 09-22); `comfy/ldm/minimax/model.py` changed only for VRAM (2d6b732,
10-01). PR #15439 (the AddGuide PR) anchored guides to the target timeline when references are present — the
`cursor` logic read at `model.py:369-377`, already in 0.38.1 — and its description gives the 22-frames-plus-audio
continuation recipe. Per-token noise masks (#15375, fix #15988) are in 0.38.1; #15375 attaches a community
masked-latent extension workflow (`droz_MiniMaxH3_BasicMaskedExtension_v1.4.json`, not inspected) — the only route to
*exact* preservation of the previous frames (E11). docs.comfy.org `minimax-h3-native` says anchoring a guide "is not
video-to-video" and that noise masks can regenerate part of a video; nothing on lip sync. No extension node exists,
local or partner.

**MiniMax prompt skills** are not in `MiniMax-AI/skills` (that repo's only video skill, `minimax-multimodal-toolkit`,
covers Hailuo-2.3 text/first-frame); they are in `MiniMax-AI/MiniMax-H3/skills` (`h3-prompt-writing` + 8 style
skills). Modes T2VA, I2VA, FL2VA, L2VA (last frame only), Ref2VA; 4–15 s; sections in English, dialogue in its own
language as `The woman (S1) says: <d>[English] …</d>`; later shots as `[Shot 2] At 00:03.500, …`; I2VA anchors the
frame at 0.00 s as fully referenced and then describes motion forward instead of re-describing the frame. Ref2VA
vocabulary: visual retention `fully_preserved / partially_preserved / attribute_transfer / weak_reference`; audio
retention `fully_copy / partially_copy / reference / weak_reference`; task types keyframe completion, reference
generation, video editing, **video continuation** (a `<Video N>` extended from its end; no worked example), audio
reuse, audio reference. Supplied audio is treated as a timbre reference unless the prompt asks for a copy — an
untested lever for the studio's voice problem (E7).

**MinimaxStoryBuilder** (one commit, 2026-08-29). README: `continuity` off / same_location (default) / always, joining on
the previous shot's last 22 frames and their audio through AddGuide at 0, trimmed before joining. Code: removed —
`director.py` docstring (every boundary a hard cut; a guide "can drift or read as a stutter at the join"),
`CONTINUITY = "off"` (~line 46), no continuity input in `nodes.py`, `segmentation.guide_request_length()` dead (it
requested +34 frames for a 22-frame guide). Every shot is `MiniMaxH3ReferenceToVideo` with the shot's cast sheets and
location plates (≤9) and ≤3 voice clips (`render_shot` ~line 149); concat with `-c copy`, no overlap trimming; voices
are 5 s H3 renders used as timbre references (15 s total cap). Prompt sections subject_definitions / summary /
retention_analysis / detailed_description / overall_soundscape / dialogue / non_diegetic_music with placeholders
resolved to `<Picture i>`/`<Audio j>` after the reference list is final. Settings in code: 928×544, 8 steps,
`euler`/`beta`, cfg 1, SigmaShift 12/3, `ref_image_size=match`, optional latent-upscale + ManualSigmas refine pass,
and a hybrid `fl2va_ref2va_b20-49-int8` checkpoint.

**Do not copy blindly from StoryBuilder.** Its hybrid checkpoint, its 928×544/euler/beta/8-step defaults and its README
are not the studio's engine; its abandonment of the guide join is a *warning to measure*, not proof that the guide
fails (its reason — drift and stutter at the trim point — is exactly what the join QA and overlap blend in §3.6 and
experiments E3/E5/E11 test). What transfers: references on every shot, subject binding after the reference list is
final, the reference budget policy, the six-section grammar.

**Hosted platform** (`POST /v2/video_generation`): `MiniMax-H3` 768P/2K 4–15 s, `MiniMax-H3-Max` 480P/768P 5–15 s
(+ `extra.prompt_expansion_mode`); prompt ≤7000 characters; roles `first_frame` ≤1, `last_frame` ≤1,
`reference_image` ≤9, `reference_video` ≤3 (2–15 s each, ≤15 s total), `reference_audio` ≤3 (same limits); ratio
adaptive/21:9/16:9/4:3/1:1/3:4/9:16; frame roles and reference roles mutually exclusive; **no extension or
continuation role**; the API page does not say whether supplied audio is copied. Context IR `POST /v2/h3_context_ir`
returns an enhanced prompt only. Regeneration `POST /v2/video_regeneration` (`source_task_id` or `base_video`, exact
original prompt, source 107–362 frames on the 17-step grid at 24 fps with audio) → 2K. Prices: H3 $0.08/s (768P),
$0.13/s (2K); H3-Max $0.05/s (480P), $0.08/s (768P); regeneration $0.05/s; Context IR $0.90/$3.60 per M tokens;
first 5 images free then $0.04 each; reference video billed by duration; audio free.

---

## 2. The current pipeline, shot by shot

### 2.1 Trace

| Step | Where | What happens | Verdict |
|---|---|---|---|
| Plan | `src/server/story/engine.ts:348-394` | LLM plans 3–10 s shots with `continuity` (positions, screen direction, wardrobe, props, light, camera) and `relationToPrevious`; also writes a `prompt` with its own `<d>` tags (`:364`); `transition` CUT/EXTEND/DISSOLVE/FADE is a second, independent field | works; two fields describe one relation and disagree in DB (3 CONTINUATION shots with `transition=CUT`, one CUT with `EXTEND`); 3–4 s shots are below H3's trained range |
| Returning location | `engine.ts:327-335` | text "RETURNING LOCATION … do not redesign it" + props last seen | text only; no plate or frame from the earlier scene is reused |
| Opening frame | `src/worker/handlers/images.ts:440-469` | Qwen-Image-Edit from the STATE plate for the scene's time of day (else MASTER) + up to 2 characters' primary images (+ face crop if alone) | 3rd+ character unreferenced; drawn even for CONTINUATION shots (then demoted to a reference picture); no identity check before video |
| Produce | `src/worker/handlers/produce.ts:42-66` | frames for every target shot, then takes in parallel; a CONTINUATION shot waits for its predecessor's job (`:61`) | no pilot/first-shot validation gate; waits for the job, not for an accepted take |
| Preflight | `src/server/org/preflight.ts:33-95` | plan consistency, prompt, duration 1–15 s, ≤9 pictures, identity via opening frame **or** canonical image, voices, song, continuation source | min 1 s (engine trained ≥124 frames); `maxGuides: 4` declared, not enforced; DRAFT canonical images only warned; no guide-fit / prompt-tag / staleness checks |
| Sound first | `take.ts:75-142` | lines recorded with the canonical voice (reused if current), ASR-checked, joined with 0.4 s lead-in / 0.35 s gaps / 0.3 s tail (`ffmpeg.ts:120-136`); shot length = words + ≤2 s | works (E2c); local backend only (`take.ts:97`) |
| Music video | `take.ts:145-150` | song stretch from the planned window as the take's soundtrack guide | window from planned durations → drift (§5) |
| Continuation | `take.ts:151-164` | if CONTINUATION, same scene, predecessor has a real selected take, local: tail 22 frames as video guide at 0, `trimStartFrames=22`, +1 s | **audio not passed**; chain not recorded for staleness |
| Soundtrack guide | `take.ts:165` | recorded dialogue (or song) as AddGuide audio at frame 0 (22 on a continuation) | works as context (E1–E2c) |
| Identity hand-off | `take.ts:170-172` | primary image of ≤4 characters (canonical, even DRAFT) | fine; 4 is an arbitrary cap below the 9-picture limit |
| Reference selection | `take.ts:178-195` | opening frame present → **fl2va, no references at all**; otherwise ref2va with opening frame + characters + master plate; voice `ref_audios` only without a soundtrack | the main identity gap (§0.4); `lastFrame` silently ignored on ref2va (`minimax-h3.ts:62-68`); STATE/VIEW plates unused |
| Prompt | `prompts.ts:52-68` | style + planner prompt (or generated middle) + exact `<d>[Lang] …</d>` lines with a 2-word speaker descriptor + avoid list | no `<Picture>`/`<Subject>` binding, no continuation sentence, `ContinuityState` unused when the planner wrote a prompt, regex truncation bug (`:66`) |
| Graph | `src/server/workflows/minimax-h3.ts:43-99` | fl2va 8-step turbo or ref2va 4-step turbo, `res_multistep`/`simple`, shifts 12/3, guides chained on positive | frame-count bug (`:10-13`); video guide audio unwired (`:81`); `simple` scheduler on ref2va; ref_videos never exposed |
| Generate | `src/server/providers/video.ts:93-112` | uploads, ComfyUI run, provenance `params.guides` | API branch drops guides (`:52-92`) |
| Picture QA | `ffmpeg.ts:68-110` | decode, duration ±25 %, resolution, black, freeze, flicker, silence, peak | no join check, no identity check |
| Speech QA | `take.ts:231-266` | whole clip transcribed, coverage ≥0.7 and CER gate, lines placed by alignment | transcribes the guide head too (insertions can fail CER on continuations) |
| Assemble | `assembly.ts:30-46, 97-158` | per-shot picture conform, `select=gte(n,trim)`; one audio track per take offset by the trim; concat; amix; loudnorm | trims both duplicated guide frames and their audio — correct; hard joins only, no fades, `transition` ignored |
| Mix plan | `assembly.ts:72-91`, `src/worker/handlers/assemble.ts:76-93` | take audio at unity; recorded lines only under silent takes; song bed 0.35 (non-MV) or master (MV, takes muted) | the character's recorded voice never reaches the cut when the take has audio |
| MV alignment | `assemble.ts:52-68`, `sync.ts:46-49` | envelope lag ±600 ms, late takes lose head frames | reads take audio from 0, ignoring `trimStartFrames` |

### 2.2 What the acceptance runs actually did (DB)

27 MiniMax takes in the dump: **23** fl2va with the opening frame (`first=true, refs=0`; 19 of them with a dialogue/song
audio guide), **4** continuations as ref2va (`refs=4`: opening frame as picture, 2 canonical images, master plate) +
tail guide `{video: true, audio: false}`, two of them also with the dialogue guide at frame 22. Engine 207–296 s for
those 4. Durations match the snap-down bug (8.708 s for 9 s, 10.833 s for 11 s). The Lamp Shop continuation prompt
(take-a5f4787ba6) shows the regex truncation and no reference binding. Both productions passed automatic QA and export
validation; no measurement of join smoothness, identity drift or cross-shot voice consistency exists.

### 2.3 Against the directive

| Directive item | Status | Gap |
|---|---|---|
| Structured, versioned World Bible (Part 7) | partial | show-level string lists only; per-shot continuity is versioned; no props/wardrobe/lighting/weather/spatial registries, no story-time state, no pinning per production |
| Persistent location identity, plates reused on return | partial | master/state plates exist; take uses master only and only on ref2va; earlier approved frames never become references |
| Character consistency from the approved canonical image | partial | used on 4/27 takes; DRAFT allowed; not bound by tag |
| Shot preparation pack (story … audio timing) | partial | scattered across `take.ts`; nothing persisted as one inspectable pack; continuity state not in the prompt |
| First shot validated before continuing | missing | `produce` runs everything at once |
| Continuation from final frames **and audio** | partial | frames yes, audio no; hosted path none |
| Verify reference-video / frame-conditioning capability | done here (§1) | studio never uses `ref_videos`; ref2va `last_frame` dropped |
| Assembly removes duplicated guide frames/audio | done | add join QA and optional overlap blend (§3.6) |
| Reapply approved references, not only last frame | missing on fl2va takes | §3.4 |
| Continuation / editorial cut / story transition distinguished | partial | only CONTINUATION changes the request; CUT and STORY_TRANSITION are generated identically; `transition` ignored |
| Authoritative audio timeline | partial | sample-exact placement yes; timeline itself derived from takes; no ambience/foley/SFX; recorded voice not in the cut |
| Audio-conditioned performance | done where supported | AddGuide audio (dialogue, song); verify by ASR |
| First-attempt reliability | partial | good preflight base; missing checks listed in §6 P0/P1 |

---

## 3. Continuation design

### 3.1 Relation decides the request

| `relationToPrevious` | Meaning | Visual conditioning | Audio conditioning | Assembly |
|---|---|---|---|---|
| **CONTINUATION** | same action, continuous time, same or continuously moving camera | AddGuide **tail clip at frame 0** (22 frames default) + canonical refs + plate refs; no opening frame drawn | tail **audio of the cut timeline** in the same AddGuide (what the audience hears), then dialogue/song guide at the first new frame | drop the guide head (picture and sound); optional overlap blend (§3.6) |
| **CUT** (editorial) | same moment, new camera setup | opening frame (drawn from plate + canonical images + previous shot's end state) as AddGuide image at 0 on ref2va, or `<Picture 1>` "starts from"; canonical + plate refs; optionally the previous shot's last 2–5 s as `<Video 1>` context (UNTESTED, E10) | dialogue/song guide; the scene's ambience bed continues under the cut in the mix (not in the model) | hard cut; 10 ms audio fades; J/L offsets allowed by the audio timeline |
| **STORY_TRANSITION** | place, time or state changes | fresh opening frame from the destination location's plate for that time of day (or the location's established references on a return, §4.5); canonical refs (wardrobe per scene) | new ambience bed; music may bridge | honour `transition` (DISSOLVE/FADE) in assembly |

Rules: `relationToPrevious` is the single source of truth; `transition` becomes an *editorial* attribute (how the
join is rendered) validated against it (CONTINUATION ⇒ CUT/EXTEND only; DISSOLVE/FADE only on STORY_TRANSITION).
CONTINUATION is refused across scenes (as today) and when the predecessor's take is not accepted.

### 3.2 Local graph per shot (one template for all three relations)

Use **ref2va for every shot that has a character or a place** (the official multiframe pattern), so the approved
references ride on every take; fl2va remains for reference-free shots (inserts, title cards) and as the measured
fallback if E4 shows ref2va loses quality:

```
UNETLoader(ref2va) → [LoRA ref2v 4-step | none, per E6] → BasicScheduler(steps, scheduler per E6)
MiniMaxH3ReferenceToVideo(prompt, w, h, length, ref_image_size per E4,
    ref_images = [canonical images in subject order…, location plate(s)…, (opening frame if bound as <Picture>)],
    ref_videos/ref_video_audios = [previous shot context]   ← CUT only, E10
    ref_audios = [voice timbre clips]                       ← speaking shots without a dialogue guide)
  → AddGuide(frame 0: tail clip 22 f + tail audio)         ← CONTINUATION
  → AddGuide(frame 0: opening frame still)                  ← CUT / STORY_TRANSITION
  → AddGuide(frame g: dialogue or song stretch, audio)      ← speaking / singing shots, g = first new frame
  → AddGuide(frame −1 or k: planned end/pose still)         ← optional, when an ending frame is approved
  → BasicGuider → SamplerCustomAdvanced → VAEDecode + VAEDecodeAudio → CreateVideo(24)
```

`minimax-h3.ts` changes: `H3Guide` gains `videoWithAudio` (wire `GetVideoComponents` outputs 0 **and 1** into one
AddGuide); `lastFrame` on ref2va becomes an AddGuide at `-1`; expose `ref_videos`/`ref_video_audios`; scheduler and
steps become parameters recorded in `workflowVersion`.

### 3.3 How many frames, which audio

- **Frames.** Valid guide clips are 5, 22, 39 … (`nodes_minimax_h3.py:202-211`; the repo comment "22 is the smallest"
  is wrong — 5 is). Default **22** (≈0.92 s: carries motion, speech rhythm and room tone; template idiom). Use 5 for
  very short continuations where every second of new content matters; 39 when a sentence or a camera move spans the
  boundary. Choose by E5. The guide frames come from the **picture as conformed in the cut** (after any extra trim)
  — i.e. the last N frames the audience sees.
- **Audio.** The tail's audio must be the audio *on the cut timeline* for those N frames: for a film, the previous
  take's own audio stretch (or, once ADR exists, the mixed dialogue for that stretch); for a music video, the song
  master stretch ending at the join. Mono 48 kHz is fine (the node resamples). Pass it in the **same** AddGuide as the
  frames (template idiom), so both streams share the anchor.
- **Length.** `length = guideFrames + framesNeeded + tailHandle`, snapped up to 17k+5, at least 124 and at most 362
  frames (the trained range), so a continuation carries at most 340 new frames (≈14.2 s) with a 22-frame guide; a
  longer action is split into more CONTINUATION shots. Assembly trims to the window (§5), so over-generation is safe;
  under-generation is not.
- **Dialogue guide position.** The first speaking frame after the guide (`frameIdx = guideFrames`), its audio cropped
  automatically to the remaining clip.

### 3.4 Reapplying approved references (never "only the last frame")

1. Slot order is fixed and recorded: subjects first (canonical front full-body image of each character in frame,
   APPROVED version only — DRAFT refuses in preflight for production takes), then the location plate chosen for the
   shot (§4.5), then at most one shot-specific production asset (opening frame, if bound as a picture). Max 9;
   trimming policy: never drop the location, drop the least important character last-to-first (StoryBuilder rule,
   REPOS-AND-ORCHESTRATION §3).
2. A deterministic **face crop of the canonical image** (pixels of the approved image, `faceCropRect` in
   `src/server/workflows/canonical-image.ts:230`) may be added for close-ups; it is an internal production asset, not
   a new identity, and is recorded as derived from the canonical version.
3. Prompt binding (vocabulary from `MiniMax-AI/MiniMax-H3/skills/h3-prompt-writing` and the installed multiframe
   template): `subject_definitions:` — `<Subject 1> is the {identity line} in <Picture 1>`; `<Picture k> is the
   place: {location name}, same architecture, layout and fixed props`; `summary:` with the task type
   (`[reference generation]`, plus `keyframe completion` when an opening frame or tail is anchored); for a
   CONTINUATION, a sentence that the first 0.9 s repeat the previous moment and the action continues from there
   (motion described forward, the anchored frames not re-described — the I2VA rule); `retention_analysis:` — subjects
   `fully_preserved` (face, hair, skin, this scene's wardrobe), plate `partially_preserved` (camera may move),
   `<Audio j>` timbre clips `reference` (or `fully_copy` if E7 shows it helps); `detailed_description:` with the
   `ContinuityState` (positions, screen direction, eyeline, holding, props, light) and `[Shot N] At 00:0x.xxx` only when
   a shot contains an internal cut; dialogue as `<Subject 1> (S1) says: <d>[Arabic] …</d>`; `overall_soundscape:` from
   the bible (ambience, foley); `non_diegetic_music:` N/A unless the timeline has a cue.
4. A continuation still carries the refs: the tail fixes the first second; the refs keep identity from drifting over
   the rest of the clip and across chained continuations (acceptance B already planned 4 continuation shots).

### 3.5 Prompt builder rules (fixes included)

- Remove the 80-character look-behind from the `<d>` stripper (`prompts.ts:66`); strip only `<d>…</d>` and an
  immediately preceding `Name:`.
- The planner stops writing `<d>` tags (`engine.ts:364`); the builder alone writes them from the script.
- One builder for both backends: local uses `<Picture i>`/`<Subject N>`/`<Audio j>`; hosted uses "Image i"/"Audio j"
  (hosted node tooltips).
- A lint step before submission: every connected picture is named once; every `<Picture i>` named exists; every
  script line is present verbatim once; no character name appears outside `subject_definitions`.

### 3.6 Assembly

- **Trim** stays as is (`assembly.ts:108` picture, `:81` audio offset).
- **Overlap blend (option, E3).** The guide region exists twice (end of shot A, head of shot B). Instead of a hard cut
  at B's frame N, shorten A by k frames and cross-fade A's last k frames with B's frames N−k…N−1 (picture), equal-power
  audio cross-fade over the same k frames. Default k = 0 for picture, k = 3 frames (125 ms) for audio, decided by E3.
  This is aimed at the failure StoryBuilder gave for dropping the guide join: the regenerated head is close to, not
  equal to, the original tail, so a hard cut at frame N can show a micro-jump ("stutter").
- **Every join**: 10 ms fade-out/in on each take's audio track to remove clicks; `transition` DISSOLVE/FADE rendered
  only on STORY_TRANSITION joins.
- **Join QA** (new inspector check, Visual Quality Inspector): at each CONTINUATION join compute the frame-difference
  of A_last→B_first-kept against the distribution of consecutive-frame differences inside A and B (pass if ≤ p95 of
  intra-shot differences), and the audio RMS step / spectral-flux jump against intra-shot values. Record per join in the
  cut's provenance; fail the take (not the cut) when a join is a jump.
- **Stale chain**: a continuation take stores `continuesTakeId` and `guide.sourceFrames`; when the predecessor's
  selected take changes, the dependent takes are marked STALE (cut assembly refuses a stale join unless the producer
  overrides) and PRODUCE regenerates them in order.

### 3.7 Story transitions and editorial cuts

- CUT: the opening frame is drawn with the previous shot's **end state** (positions, screen direction, props) from its
  `ContinuityState` and, when available, the previous take's last frame as an *extra* image reference to Qwen-Image-Edit
  (lighting/wardrobe match), then the take anchors that frame. Ambience continuity comes from the audio timeline, not
  from the model.
- STORY_TRANSITION: the destination's plate set (§4.5) and the bible's state at the new story time; the previous shot
  contributes nothing visual.

### 3.8 Hosted path (when a key exists)

The ShotPack (§4.4) is lowered differently, because the platform has no anchored guides and forbids mixing frame and
reference roles: CONTINUATION → either (a) `first_frame` = the last conformed frame of the previous take (no
references allowed in that mode; identity rests on the frame, so limit hosted chains to 2 before a reference-based
shot), or (b) reference mode with the canonical images, the plate and the previous take's last 2–15 s as
`reference_video`, prompted with the skill's "video continuation" task type (no worked example upstream — E12 before
use); in both cases the new clip has no duplicated head, so the cut does **not** trim. CUT/STORY_TRANSITION →
reference mode ("Image i") with canonical images and plate. No dialogue guide exists: speaking takes rely on `<d>`
and ASR verification. Prompt lint adds the 7000-character limit. `generateVideo` must refuse (not drop) guides on the
API path and record the lowering in provenance. The 2K regeneration endpoint is a finishing option for an approved
768P take (same prompt and inputs).

### 3.9 First shot validated, then the rest

PRODUCE runs a **pilot**: the first shot of each scene (and every CONTINUATION chain head) is generated alone, passes
automatic QA, and waits for an approval (human, or automatic when the production is in auto mode and every check
passed); then the scene's remaining shots run, continuations strictly in order after their accepted predecessor.
A failed pilot stops that scene only.

### 3.10 Experiments needed before defaults change (bounded, measured)

| # | Question | Setup | Measure | Decides |
|---|---|---|---|---|
| E3 | Does tail audio in the guide improve joins? | same continuation shot, seed fixed: frames-only vs frames+audio | join metrics (§3.6), ambience spectral match, ASR of the first new second | default `videoWithAudio` and audio cross-fade k |
| E4 | ref2va+guide vs fl2va+first frame for identity and picture quality | 3 shots × 2 graphs, same seeds; `ref_image_size` match vs max | human identity rating vs canonical, face-crop similarity if a face model is wired, engine time | ref2va as default for character shots |
| E5 | Guide length 5 / 22 / 39 | one continuous action split into 3 shots | join metrics, drift over the chain | default guide length |
| E6 | ref2va steps/scheduler | LoRA 4-step vs no LoRA 12 / 20 steps; `simple` vs `beta` | script coverage/CER, timbre, artefacts, engine time | steps and scheduler for speaking ref2va shots |
| E7 | Can a recorded line as `<Audio j>` + "use <Audio 1> exactly" bring H3's voice closer to the TTS identity? | AddGuide audio only vs + `ref_audios` with retention wording | timbre distance to the recording, WER | voice-conditioning recipe |
| E8 | ADR feasibility | take speech vs recorded line | word-onset alignment error per word | whether the cut may replace H3 speech (§5.3) |
| E9 | Returning location | plate only vs plate + established frame from the earlier approved take | human "same place" rating, structural similarity of fixed features | §4.5 default |
| E10 | Previous shot as `<Video 1>` on a CUT | with/without the context video | eyeline/position/light match rating | CUT recipe |
| E11 | Exact head via masked-latent extension (PR #15375 workflow) vs AddGuide tail | same continuation, same seed | join metrics; whether stock nodes suffice | whether a custom node is worth owning |
| E12 | Hosted continuation (needs a key): first-frame vs `reference_video` + "video continuation" | 2-shot chain | join metrics, identity | hosted CONTINUATION lowering |

E7 note: upstream skills say supplied audio is a timbre reference *unless the prompt asks for a copy*
(`fully_copy`, "audio reuse" task); E1 used no such wording. The model code still generates the audio stream, so the
best case is a close re-performance, which E8's alignment measure then decides whether to keep.

---

## 4. World Bible data model

### 4.1 Principles

- **One identity per entity, versioned.** Characters keep the canonical image (versioned, approved) and the voice
  identity (revisioned); everything else generated for a shot is a *production asset* that points back to the
  identity version it was derived from and can never replace it.
- **Revisions are append-only and pinned.** A production pins the bible revision it was approved against (the STORY
  gate); every job reads that pinned revision; a take records the entity versions it used. Editing the bible creates
  a new revision; productions see it only after a re-pin (with a diff shown).
- **State is separate from canon.** Canon = what is always true (architecture, face, voice). State = what is true at a
  story time (wardrobe of the day, prop positions, weather, injuries). State lives on a story timeline.

### 4.2 Entities (TypeScript sketch, `src/domain/bible.ts`)

```ts
interface BibleRevision { id: string; scope: { showId?: string; productionId?: string }; number: number; parentId?: string;
  author: { kind: 'AGENT' | 'HUMAN'; id: string }; createdAt: string; changes: BibleChange[]; note?: string }

interface WorldBible {                                 // the resolved view at one revision
  revisionId: string;
  rules: Array<{ id: string; text: string; scope: 'WORLD' | 'VISUAL' | 'AUDIO' | 'LANGUAGE' }>;
  art: { styleDirectionId: string; palette?: string[]; lensRules?: string; aspect: Aspect };
  characters: Array<{ characterId: string; canonicalImageVersion: number; voiceIdentityRevision?: number;
    wardrobe: Array<{ id: string; label: string; description: string; refAssetId?: string /* SECONDARY, derived */ }>;
    defaultWardrobeId: string }>;
  relationships: Array<{ a: string; b: string; kind: string; since?: StoryTime; note?: string }>;
  locations: Array<{ locationId: string; canon: LocationCanon; plates: PlateRef[]; ambience: AmbienceRef[] }>;
  props: Array<{ id: string; name: string; ownerCharacterId?: string; description: string; refAssetId?: string; fixedAtLocationId?: string }>;
  timeline: Array<{ id: string; storyTime: StoryTime; productionId?: string; sceneId?: string; event: string }>;
  states: Array<WorldState>;                           // keyed by story time / scene entry & exit
  voices: Array<{ characterId: string; identityRevision: number }>;
  music: Array<{ id: string; kind: 'THEME' | 'CUE'; assetId?: string; description: string }>;
}

interface LocationCanon { kind: 'INTERIOR' | 'EXTERIOR'; architecture: string; materials: string[]; fixedFeatures: string[];
  layout: { zones: Array<{ id: string; name: string; description: string }>; entrances: string[]; geography?: string;
            cameraSetups: Array<{ id: string; zoneId: string; facing: string; lens?: string }> } }

interface PlateRef { assetId: string; role: 'MASTER' | 'VIEW' | 'STATE' | 'ESTABLISHED'; cameraSetupId?: string;
  timeOfDay?: TimeOfDay; weather?: string;
  source: { kind: 'DRAWN'; jobId: string } | { kind: 'FROM_TAKE'; takeId: string; frame: number; approvedAt: string } }

interface WorldState { id: string; storyTime: StoryTime; at: { sceneId: string; edge: 'ENTRY' | 'EXIT' };
  characters: Array<{ characterId: string; locationId?: string; zoneId?: string; wardrobeId: string; holding: string[]; condition?: string }>;
  props: Array<{ propId: string; locationId?: string; zoneId?: string; state: string }>;
  environment: { locationId?: string; timeOfDay: TimeOfDay; weather?: string; lighting?: string } }

type StoryTime = { day: number; time?: TimeOfDay; order: number };
```

`ContinuityState` (per shot, already versioned) stays the shot-level record; it gains `wardrobeId`/`propId`/`zoneId`
references into the bible so the planner writes ids, not free text, where the bible has them.

### 4.3 Storage

- `bible_revisions(id, show_id, production_id, number, parent_id, author, changes jsonb, created_at)` and
  `bible_snapshots(revision_id, data jsonb)` (resolved view, written once per revision for cheap reads).
- `productions.bible_revision_id` (pinned at STORY approval); `takes.context_hash` + `takes.context` (the ShotPack,
  below) for provenance.
- Shorts and music videos get a production-scoped bible (`scope.productionId`), shows a show-scoped one; an episode
  inherits the show revision and may add production-scoped changes.
- Migration: `Show.bible` strings → rules/relationships/timeline entries of revision 1; `Location.refs`/`layout` →
  canon + plates; `Character.wardrobe` → the default wardrobe entry; existing `continuity_versions` untouched.

### 4.4 How jobs read it — the ShotPack

A pure resolver `resolveShotPack(state, bible, production, shot, capabilities)` (`src/server/production/shot-pack.ts`)
returns everything the directive lists for shot preparation, persisted on the take:

```ts
interface ShotPack {
  shotId: string; bibleRevisionId: string; relation: 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION';
  story: { sceneId: string; purpose: string; beat: string; storyTime: StoryTime };
  script: Array<{ lineId: string; characterId: string; text: string; language: Language; recordingAssetId?: string; window?: Window }>;
  subjects: Array<{ characterId: string; canonicalAssetId: string; canonicalVersion: number; faceCropAssetId?: string; wardrobeId: string; identityLine: string }>;
  location: { locationId: string; plate: PlateRef; extraPlates: PlateRef[]; zoneId?: string };
  camera: { framing: Framing; move: CameraMove; setupId?: string; lens?: string; angle?: string };
  blocking: ContinuityState['characters']; props: ContinuityState['props']; lighting: string; weather?: string;
  opening: { kind: 'TAIL'; takeId: string; frames: number; withAudio: boolean } | { kind: 'FRAME'; assetId: string } | { kind: 'NONE' };
  ending?: { assetId: string; frameIdx: number };
  audio: { window: Window; guides: Array<{ frameIdx: number; assetId: string; from: number; to: number; kind: 'DIALOGUE' | 'SONG' | 'TAIL' }>; timbre: string[] };
  generation: { backend: 'local' | 'api'; graph: 'REF2VA' | 'FL2VA'; frames: number; steps: number; scheduler: string; seed: number };
  prompt: string; lint: Array<{ rule: string; ok: boolean; detail?: string }>;
}
```

`take.ts` becomes: resolve pack → preflight(pack) → lower(pack, backend) → generate → QA(pack) → record(pack hash).
"Another take" re-uses the stored pack (with a new seed), so a retake is the same request, not a re-derivation.

### 4.5 Returning to an established location

1. Plate choice for a shot: the location's `cameraSetup` that matches the shot's framing/zone → its VIEW plate; else
   MASTER; replace by the STATE plate of the scene's time of day when one exists; weather variants likewise.
2. **ESTABLISHED references**: when a take at a location is approved (cut approval), the Art Director extracts one clean
   frame per camera setup used (sharpest frame without characters occluding fixed features, or simply the opening
   frame of a wide shot) and registers it as `PlateRef{role:'ESTABLISHED', source:FROM_TAKE}` in a new bible revision.
3. On return (any later scene, episode or season at that place): the opening frame is drawn from the ESTABLISHED
   frame of the matching setup (else the plate) and the take gets that same frame as a location `<Picture>` with
   `partially_preserved` wording; the world state at the new story time supplies prop positions and light.
4. The canonical plates never change once a location has been used in an approved cut (a location lock, mirroring
   the character appearance lock); new plates are added, never swapped.

---

## 5. Audio timeline

### 5.1 Today

Sample-exact placement in whole frames/samples (`assembly.ts:20-23, 127-136`); one sound per stretch; recorded lines
first and verified; MV takes muted under the master and lag-shifted. All good foundations.

### 5.2 Gaps

1. **Not authoritative**: the cut's clock is the sum of take lengths (`assembly.ts:30-46`); song windows come from
   planned durations (`timeline.ts:15-20`). Snapping and dialogue-fit changes move every later shot.
2. **Character voice lost**: the cut plays H3's regenerated speech; the canonical recording never reaches the mix
   when the take has audio (`assembly.ts:81-85`). Cross-shot voice consistency is unmeasured.
3. **Track kinds unused**: AMBIENCE, FOLEY, SOUND_EFFECTS, LEAD_VOCAL, BACKING_VOCAL are declared (`assembly.ts:50`)
   and shown in the UI (`FinalCutTab.tsx:58`) but never produced; stems are 2-way (vocals / no_vocals).
4. **No bed across cuts**: every take brings its own room tone; joins are hard with no fades.
5. **No ducking**: the non-MV song bed is a fixed 0.35 gain (`assembly.ts:86`).
6. **Guide region in checks**: ASR (`take.ts:237`) and MV lag (`sync.ts:47`) read the take from 0, not from the trim.
7. **Hosted path**: no audio guides at all.

### 5.3 Proposed model

An `AudioTimeline` per production (`src/domain/audio-timeline.ts`), built at the SHOT_PLAN → AUDIO_PREP handoff and
before any video:

```ts
interface AudioTimeline { rate: 48000; fps: 24; totalSamples: number; revision: number;
  shots: Array<{ shotId: string; startSample: number; durationSamples: number; headHandleFrames: number; tailHandleFrames: number }>;
  cues: Array<{ id: string; kind: AudioTrackKind; assetId?: string; generator?: 'TTS' | 'SONG' | 'H3' | 'LIBRARY';
    startSample: number; durationSamples: number; sourceOffsetSamples: number; gain: number; duckUnder?: AudioTrackKind[];
    shotId?: string; lineId?: string; characterId?: string }> }
```

- **Dialogue** lines placed from their recorded durations (with J/L offsets the planner may request); each shot's
  window is derived from its lines, never the reverse. **Song** sections from `lineTimes`; shots are windows on the
  song. **Ambience** bed per scene from the location's `ambience` (library asset or a long H3 ambience render of the
  plate, UNTESTED) spanning the scene; **foley/SFX** cues from the shot plan's soundscape (initially carried by H3's
  own audio, typed as GENERATED_VIDEO_AUDIO).
- **Picture conforms to sound**: a take is generated to cover `window + handles` (≥124 frames) and the cut takes exactly
  its window, so snapping never moves anything.
- **Model audio policy** per shot: `KEEP` (today), `DIALOGUE_REPLACE` (E8 passes: mix the recorded line at the measured
  offset, keep H3's non-vocal stem via Demucs `audio.separate_stems` as foley/ambience), or `MUTE` (MV).
- **Audio-conditioned performance** where supported: dialogue and song stretches as AddGuide audio at the window's
  first frame (local); tail audio for continuations; `<Audio j>` timbre references; hosted: none.
- Mix: ducking of music/ambience under dialogue (sidechain or per-cue gain automation), 10 ms fades at every cue edge,
  loudness as today.

---

## 6. Prioritised implementation plan

### P0 — correctness fixes (small, no design risk)

| # | Change | Files | Test |
|---|---|---|---|
| P0.1 | Frame count snaps **up** like the node/template; minimum 124 frames | `src/server/workflows/minimax-h3.ts:10-13` | unit: parity with `n + ((5 − n % 17) % 17 + 17) % 17` for 1–15 s; ≥124 |
| P0.2 | Continuation guide carries the tail audio (`GetVideoComponents` 0 and 1 into one AddGuide) | `minimax-h3.ts:19-27, 76-88`; `take.ts:160` | unit: graph has `audio` linked on the tail guide; DB provenance `guides[0].audio=true` |
| P0.3 | Fix the `<d>` stripper (no 80-char look-behind); planner stops writing `<d>` | `src/server/story/prompts.ts:66`; `src/server/story/engine.ts:364` | unit: planner prompt of Lamp Shop 1.2 keeps "slumps on counter … wooden textures" |
| P0.4 | Speech check and MV lag read from `trimStartFrames` | `take.ts:237`; `src/server/media/sync.ts:46-48`, `src/worker/handlers/assemble.ts:59` | unit: ffmpeg args include `-ss trim/24` |
| P0.5 | API path refuses guides instead of dropping them; records the lowering | `src/server/providers/video.ts:52-68` | unit |
| P0.6 | Preflight: min duration ≥124 frames after snapping, guide-fit (`frameIdx + guideFrames ≤ frames`), `maxGuides` enforced, DRAFT canonical image refused for production takes (warning kept for previews) | `src/server/org/preflight.ts:28, 54, 66-72` | `tests/unit/preflight.test.ts` cases |
| P0.7 | Ref2VA honours `lastFrame` (AddGuide at −1) | `minimax-h3.ts:62-74` | unit |
| P0.8 | Correct the comments: guides are context, not exact; 5 is the smallest clip | `minimax-h3.ts:15-18, 39-41`; `skills/h3-prompting/SKILL.md` | review |

### P1 — references on every shot, ShotPack, prompt grammar (after E4/E6 on 3 shots)

- `src/server/production/shot-pack.ts` (new) + `take.ts` refactor to resolve → preflight → lower → generate → QA.
- `src/server/story/prompts.ts`: H3 ref2va grammar builder (`subject_definitions`, `retention_analysis`,
  `detailed_description` with `[Shot 1]`, soundscape) + lint; hosted "Image i" variant.
- `minimax-h3.ts`: ref2va default for character/location shots, opening frame as AddGuide at 0, `ref_videos`, scheduler
  and steps parameters; `workflowVersion` changes accordingly.
- `src/worker/handlers/images.ts:440-469`: opening frames for CUT from the previous end state (+ previous last frame as
  an extra reference); no opening frame for CONTINUATION shots; all characters in frame up to the slot budget.
- `src/worker/handlers/produce.ts`: pilot gate per scene and strict ordering of continuation chains on *accepted* takes.
- `src/domain/types.ts`: `Take.continuesTakeId`, `Take.context`/`contextHash`, `Take.status` gains `STALE`;
  `ContinuityState.relationToPrevious` authoritative, `transition` validated.

### P2 — World Bible

- `src/domain/bible.ts`, `src/server/db/schema.ts` (`bible_revisions`, `bible_snapshots`, `productions.bible_revision_id`),
  migration in `drizzle/`, commands in `src/domain/commands.ts`/`actions.ts`, resolver used by `engine.ts` (planner),
  `images.ts` (frames), `shot-pack.ts` (takes). ESTABLISHED plates registered at cut approval
  (`src/server/org/gates.ts` approval hook). Location lock in `src/domain/rules.ts`.

### P3 — Audio timeline and assembly

- `src/domain/audio-timeline.ts`, built in a new AUDIO_PREP step (DIALOGUE_AUDIO job already exists, `src/domain/jobs.ts:20`);
  `src/server/media/assembly.ts`: picture conformed to windows, fades, overlap blend option, transitions, ducking,
  AMBIENCE/FOLEY tracks; join QA in the Visual Quality Inspector; DIALOGUE_REPLACE behind E8.

### First-attempt reliability (what the plan buys)

The engine is asked only for requests that can succeed and that are the same request on every retry: preflight on
the ShotPack (durations inside 124–362 frames after snapping, guide fit, reference and audio budgets, APPROVED
canonical versions, prompt lint, predecessor accepted and not stale); a pilot shot per scene before the batch; the
stored pack reused by "Another take" with only the seed changed; the GPU lease kept exclusive (no story model beside a
video batch, `docs/OPERATIONS.md`); and creative failures classified by the inspectors (identity, join,
script) rather than retried blindly. Metric to report: first-attempt acceptance per shot relation (CONTINUATION /
CUT / STORY_TRANSITION) next to the existing technical success rate.

### Acceptance tests

| ID | Scenario | Pass criteria |
|---|---|---|
| **AT-1 Multi-shot continuous action** | One scene, one location, 2 characters; 4 shots marked CONTINUATION (e.g. a character walks from the door to the counter, sets down a parcel, the other picks it up, both speak once), produced through PRODUCE with the pilot gate | (a) shots 2–4 wait for the accepted predecessor; (b) each take's provenance shows tail guide `{video, audio}` 22 frames, canonical refs for both characters, plate, `continuesTakeId`; (c) cut drops exactly 22 frames and 22 frames of audio per join (ffprobe frame counts and `adelay`/`atrim` samples in provenance); (d) join QA passes at all 3 joins (frame-difference ≤ p95 intra-shot; audio RMS step ≤ p95 intra-shot); (e) both lines heard (coverage ≥0.7, CER gate) and subtitles on their aligned windows; (f) re-selecting another take for shot 2 marks shots 3–4 STALE and the cut refuses until regenerated |
| **AT-2 Return to an established location** | Scene 1 at location L (morning), scene 2 elsewhere, scene 3 back at L (dusk), same characters; cut 1 approved before scene 3 is produced (or an episode 2 of a show) | (a) after approval L has ESTABLISHED plates from scene 1 takes in a new bible revision; (b) scene 3's opening frames and takes reference L's ESTABLISHED/STATE(dusk) plates by id (provenance); (c) fixed features listed in L's canon are present (human check, recorded on the QA report); (d) props in scene 3 follow the world state at its story time; (e) L's plates are locked (redraw refused) |
| AT-3 Editorial cut | Same moment, two angles (CUT) | opening frame drawn from the previous end state; screen direction preserved; ambience bed continuous across the join (no RMS step > 3 dB in the bed) |
| AT-4 Story transition | Time skip at the same place, DISSOLVE | dissolve rendered; new STATE plate; ambience changes at the join |
| AT-5 Speaking continuation | A sentence split across two CONTINUATION shots | words not duplicated or lost at the join (ASR of the cut across the join equals the script) |
| Unit | `minimax-h3` graph shapes (fl2va, ref2va, guides with audio, last frame on ref2va), frame-count parity, prompt grammar lint, ShotPack resolution, stale-chain marking, timeline conform, mix-plan fades | `pnpm test` |

---

## 7. Sources

- Installed source (ComfyUI v0.38.1, container `vewbox-comfyui-1`): `/opt/comfyui/comfy_extras/nodes_minimax_h3.py`,
  `/opt/comfyui/comfy/ldm/minimax/model.py`, `/opt/comfyui/comfy/model_base.py:2152-2286`,
  `/opt/comfyui/comfy/text_encoders/minimax.py`, `/opt/comfyui/comfy/samplers.py:1297-1305`,
  `/opt/comfyui/comfy_extras/nodes_latent.py:446-482`, `/opt/comfyui/comfy/supported_models.py:964-972`.
- Installed templates (`comfyui_workflow_templates` 0.11.73): `video_minimax_h3_i2v`, `video_minimax_h3_i2v_continuation`,
  `video_minimax_h3_t2v`, `video_minimax_h3_r2v`, `video_minimax_h3_multiframe_reference`, `index.json`.
- `/object_info` for `EmptyMiniMaxH3LatentAV`, `MiniMaxH3ImageToVideo`, `MiniMaxH3AddGuide`, `MiniMaxH3ReferenceToVideo`,
  `MiniMaxH3SigmaShift`, `MiniMaxH3FunControlNetApply`, `MinimaxHailuo03*`, `ComfyCloudMiniMaxH3*`; `/models/*`.
- DB backup `var/backups/phase0-cleanup-20261002-2347/database.dump` (tables `takes`, `shots`, `productions`).
- Repository files cited inline; prior research `docs/AUDIOVISUAL-QA.md`, `docs/research/LOCAL-ENGINES.md`,
  `docs/research/MINIMAX-API.md`, `docs/research/REPOS-AND-ORCHESTRATION.md` §3, `docs/IMPLEMENTATION-CHECKLIST.md` 13.5, 14.9, 14.10.
- Upstream (read 2026-10-03): https://github.com/lumosai8/MinimaxStoryBuilder (`README.md`, `director.py`,
  `segmentation.py`, `nodes.py`, `prompts.py`, `project.py`); https://github.com/MiniMax-AI/skills;
  https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills (`h3-prompt-writing/SKILL.md`, `references/base-en.txt`,
  `references/ref-en.txt`); https://github.com/Comfy-Org/ComfyUI (master, PRs #15375, #15439, #15988, #16471, commit
  2d6b732); https://github.com/Comfy-Org/workflow_templates; https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native;
  https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3/workflow;
  https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md;
  https://platform.minimax.io/docs/guides/pricing-paygo.md.

---

## 8. Implementation status (P0 + P1, 2026-10-03)

Implemented and unit-tested; measured runs in `docs/evidence/minimax-p1/README.md` (E4/E6 subset, the P0.2
continuation, an E3 subset). P0.1 frames snap up, 124–362 (`minimax-h3.ts` `h3FrameCount`); P0.2 the tail guide
carries its sound (`H3Guide.audioFromVideo`) — except into a shot without lines when the previous take speaks in its
tail (measured: H3 kept talking; `shot-pack.ts` `speechInTail`); P0.3 `stripDialogueTags`, planner writes no tags;
P0.4 speech check and MV lag read after the head; P0.5 hosted refuses guides and frame+reference mixes
(NOT_CONFIGURED / UNSUPPORTED_CAPABILITY) and the take handler lowers the request; P0.6 preflight on the shot pack
(frames, picture budget, guides counted and fitted, identity from canonical images; DRAFT stays a warning, per the
identity contract); P0.7 Ref2VA anchors first/last frame at 0 / −1. P1: `src/server/production/shot-pack.ts`
(relation, identity references on every shot, opening, graph, hosted lowering), `h3ReferencePrompt` + `lintH3Prompt`
(grammar verified in the tokenizer and the installed template; dialogue form and vocabulary from MiniMax-H3
`skills/h3-prompt-writing/references/ref-en.txt`), the pilot gate in PRODUCE (`pilot-gate`, Quality Director),
continuations queued only after an accepted predecessor, no opening frame for a continuation, CUT frames drawn with
the previous shot's state, `takes.relation` / `takes.continues_take_id` (migration 0008, not applied). Not done: the
persisted ShotPack and STALE chains (§3.6), overlap blend and join QA in assembly, E5/E7–E12, P2 (World Bible),
P3 (audio timeline).
