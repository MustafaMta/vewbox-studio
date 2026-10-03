# StoryBuilder integration — what MinimaxStoryBuilder really does, and what Vewbox should take from it

Investigation of 2026-10-04 by the Continuity and Video Pipeline Lead. Read-only for both codebases; no generation ran.

- **SB** = `lumosai8/MinimaxStoryBuilder` at `47b6ceb` (its only commit, 2026-08-29), cloned to
  `D:\volexar-studio\research\MinimaxStoryBuilder` (outside this repository). Citations `file:line` are into that clone.
- **VB** = this repository at `3d11958` (`main`). Citations are repository-relative.
- **SRC** = the installed ComfyUI `v0.38.1` in the running `vewbox-comfyui-1`, read with `docker exec … sed/grep`
  (nothing started or stopped). The SB tests were **not** executed (no Python on the host); the grid arithmetic below
  was checked by hand against `segmentation.py` and the assertions in `tests/test_segmentation.py`.
- **Licence.** SB is MIT (`LICENSE:1-21`, © 2026 lumos675). Code *may* be reused, including commercially, provided the
  copyright and permission notice travel with any substantial portion. In practice SB is Python ComfyUI nodes and VB is
  TypeScript, so what transfers is technique; if any prompt text or function is ported near-verbatim (e.g. the
  staging rules, `_beat_weights`, `_limit_cuts`), add SB's MIT notice to a third-party notices file in the same commit.

---

## 0. Verdict in one page

1. **The producer's description matches SB's README, not SB's code.** README:370-398 describes a `continuity` setting
   (`off` / `same_location` default / `always`) that anchors the previous shot's **last 22 frames and their audio** at
   frame 0 with `MiniMaxH3AddGuide`, then trims those frames and the matching audio before joining. **None of that is in
   the shipped code**: `director.py:1-13` says every boundary is a hard cut ("a guide can drift or read as a stutter at
   the join"), `director.py:51-53` hardcodes `CONTINUITY = "off"`, the Director node has no continuity input
   (`nodes.py:648-733`), `MiniMaxH3AddGuide` is never imported or called (only `MiniMaxH3ReferenceToVideo` and
   `MiniMaxH3SigmaShift`, `director.py:23`), and assembly is a stream-copy concat with no trim (`project.py:554-599`).
   What survives is a dead helper, `segmentation.guide_request_length()` (`segmentation.py:85-98`), and its tests
   (`tests/test_segmentation.py:35-52`). `segmentation.py:39-42` and `tests/test_segmentation.py:58-60` say outright
   that the guide "is gone". The README is stale on shot length too (§d).
2. **VB already implements more continuation than SB ever shipped**: tail frames + their sound in one AddGuide at 0,
   the guide cut from the frames the audience actually sees, frame-exact picture trim, sample-exact audio offset,
   a 3-frame equal-power cross-fade, join QA, `speechInTail`, pilot gate, hosted lowering (§b.3, §e.2). The 22-frame
   number is real — it is the node's quantisation (5, 22, 39 …), verified in SRC — but SB never ran it in code.
3. **What is worth taking from SB is planning and prompting, not joining**: timed beats inside a take with action-
   weighted durations; in-take hard cuts (`[Shot N] At MM:SS.mmm`) as a cheap editorial cut that keeps identity for
   free; `pace` / `actions` coverage in the outline; cast reconciliation against the beats; crowds as picture-less
   subjects; declaring over-budget characters from their description; POV handling; silent-shot speech scrubbing; the
   close-framing rule for faces; SB's "refuse the guide rather than truncate" frame-budget policy (§e.1, §f).
4. **VB's own remaining continuation gaps** (independent of SB): the guide clip's real frame count is never validated
   (a short tail silently floors to 5 frames while the cut still drops 22), the head is never checked to be a repeat
   before it is dropped, there is no stale-chain marking, and `scripts/check-comfy-nodes.mjs` does not check the three
   nodes the continuation graph needs (§f.1-§f.5, §f.9).

---

## (a) The StoryBuilder pipeline

```
story text (+ user context, style preset)                         nodes.py:88-165  planner.py:724-900
 ├─ 1. CAST       1 LLM call  → style, mood, characters{name,identity,appearance,voice,seen}, groups, locations
 │                               prompts.py:264-376 (CAST_SYSTEM_PROMPT), planner.py:843-846, _clean_cast :56-114
 ├─ 2. OUTLINE    1 LLM call  → scenes{text,summary,actions[],location,moves_to,characters,groups,time,pace}
 │                               one scene == one 15 s clip; count = ceil(len(story)/225) unless pinned
 │                               prompts.py:1323-1427, planner.py:571-594, :773-779, _clean_scenes :489-543
 ├─ 3. STAGING    1 LLM call per scene (whole outline + previous 2 shots as context, only this scene's text)
 │                → shot{characters,groups,pov,time,pace,location,beats[{start,end,cut,action,camera,location,time}],
 │                       camera,dialogue[],vocals,soundscape,music="N/A"}
 │                prompts.py:1430-1734, planner.py:597-670; code fixes: _clean_beats :174-206, _limit_cuts :251-298,
 │                _reconcile_cast :320-349, _limit_pov :555-568; frames = 362 always (_shot_frames :458-477)
 ├─ 4. CASTING    Krea2 text-to-image, 2048², 8 steps: 1 head-and-shoulders portrait per seen character,
 │                1 empty plate per location; unseen characters get none            casting.py:115-230, :165-167
 ├─ 5. VOICES     (optional) H3 itself renders 124 frames at 768² of each character speaking a fixed text from
 │                their portrait; video latent discarded, audio decoded and cut to 5.0 s  director.py:254-305
 ├─ 6. SHOTS      per shot: select ≤9 refs (characters then all locations) + ≤3 voice refs (speakers only),
 │                build 6-section prompt with {{name}} placeholders → <Picture i>/<Audio j>,
 │                MiniMaxH3ReferenceToVideo → common_ksampler (cfg 1) [→ 3D latent upscale → partial-noise refine]
 │                → VAE decode video + audio → mux mp4 at 24 fps      director.py:160-251, :429-494; project.py:746-756
 │                cache key = sha256(shot, seed, refs, style, "off", upscale_key, prompt_text)  project.py:194-209
 └─ 7. ASSEMBLY   every boundary a hard cut: ffmpeg concat demuxer, `-c copy` (audio re-encoded to AAC 48 kHz only
                  if needed)                                            director.py:496-505, project.py:554-599
     EDITOR       optional: trims/mutes/gain/narration in timeline.json (outside the cache key) → one re-encode with
                  trim/atrim in seconds and `-r 24`                     project.py:682-743, :1465-1493, :1694-1751
```

---

## (b) Continuation mechanics — exact, with numbers

### b.1 What SB claims vs what SB's code does

| Question | SB README (claim) | SB code (fact) |
|---|---|---|
| Node / field for guide frames | `MiniMaxH3AddGuide`, frame 0 (README:380-381) | **no call anywhere**; only `MiniMaxH3ReferenceToVideo` + `MiniMaxH3SigmaShift` imported (`director.py:23`) |
| Guide audio | "and their audio" (README:380) | none; the only reference audio is per-character `ref_audios` timbre clips (`director.py:212-219`) |
| Guide length | 22 frames, ~0.9 s; "22, not 21" because H3 floors to 5, 22, 39 … (README:386-388) | literal `22` only in tests (`tests/test_segmentation.py:39-52`); no constant in source |
| Frame rate | 24 fps (README:502) | `FPS = 24` (`segmentation.py:25`); mux at 24 (`project.py:746-756`); export `-r 24` (`project.py:729-735`) |
| Resolution | 1344×768 suggested (README:500) | Director default **928×544** (`director.py:33-34`; example workflow node 34, `story_to_film.json:1160`); voices 768×768 (`director.py:257-258`) |
| Shot length grid | 17k+5, 124–362 (README:251-259) | `FRAME_GRID=17, FRAME_BASE=5, MIN=124, MAX=362` (`segmentation.py:25-30`); `align_up` (`:69-72`) |
| Request length with guide | "17 frames longer than its text needs" (README:389-392) | `guide_request_length(f, g) = align_up(f+g)`, `None` if >362 (`segmentation.py:85-98`). For an on-grid `f` and `g=22`: **f+34** (124→158, 226→260, 328→362, 345→None). After dropping 22, **12 frames (0.5 s) of slack** remain — the README's "17" and the docstring's "costs 17 frames (~0.7 s)" are both wrong |
| Trim computation | "trims those frames (and the matching audio) before joining" (README:389-392) | **no guide trim exists.** Only trims: editor in/out in seconds (`project.py:701-707`, 3 decimals); voice clips `waveform[..., :int(5.0*rate)]` (`director.py:301-305`) |
| Audio sample offset | — | none for joins (see above) |
| Validation | "ceiling wins": hard cut instead of truncation (README:393-395) | `guide_request_length` returns `None` (`segmentation.py:97-98`); tests: on-grid, ≤362, `request−22 ≥ frames`, 362/345 refuse, 328→362 (`tests/test_segmentation.py:35-52`). Dead code: no caller |
| Cache | — | `CONTINUITY="off"` and `guide_hash` still in the cache key (`project.py:194-209`, `director.py:436-442`) |

**Why SB dropped it (its own words):** "a guide can drift or read as a stutter at the join, where a hard cut with the
same references just reads as an edit" (`director.py:6-9`). Consistency is carried by re-sending the portraits and
plates on every shot instead. This is a *warning to measure* our joins, not evidence that the guide fails: VB's C1
measured the re-rendered head at PSNR 38.7 dB / SSIM 0.98 against the source tail and the join inside the intra-shot
range (`docs/evidence/minimax-p1/README.md:22`).

### b.2 What the node actually does (SRC, ComfyUI v0.38.1 `comfy_extras/nodes_minimax_h3.py`)

- `FPS = 24`, `AUDIO_LATENT_FPS = 40` (`:34-35`); canvas multiple 32, base short edge 768, `MAX_PIXELS = 768*1344`
  (`:30-32`); target length snapped **up** to 17k+5 (`align_frame_count`, `:38-40`).
- `MiniMaxH3AddGuide` (`:166-240`): an image batch of <5 frames becomes **1** frame; otherwise it is snapped **down**
  to 17k+5 (`:203-211`) — so 21 frames silently become 5. It must fit: `resolved + guide_frames ≤ frame_count`, else
  `ValueError` (`:213-218`). Guide audio is resampled to the audio VAE rate (`_encode_ref_audio`, `:75-82`, default
  32 kHz), encoded, and **cropped** to the remaining track from `frame_idx` (`:225-235`). Both go into
  `minimax_keyframes` on the conditioning (`:237-240`); the latent is untouched.
- **Audio granularity:** 40 latent steps a second = 0.6 video frames per step, so 22 frames = 36.67 audio latent steps
  (5 → 8.33, 39 → 65). No guide length lands on an audio-latent boundary; any hard audio cut at the trim point sits
  within ±12.5 ms of one — the reason for a short cross-fade rather than a butt join.
- Keyframe rows are never denoised and the target is always fully generated (`comfy/ldm/minimax/model.py`, see
  `docs/research/MINIMAX-CONTINUITY.md` §1.2): the head is a close **re-render** of the tail, not a copy, for both
  picture and sound. That is what makes a duplicate-removal *check* (not just a trim) necessary (§f.3).

### b.3 Vewbox's implementation of the same mechanism (for comparison)

| Step | VB code | Numbers |
|---|---|---|
| Guide length | `H3_GUIDE_FRAMES = 22` (`src/server/workflows/minimax-h3.ts:89`); node quantisation mirrored in `h3GuideClipFrames` (`:38-43`) and fit in `h3GuideFits` (`:47-50`) | 22 frames = 0.917 s |
| Which frames | `windowEndSourceFrame` — the last frames of the previous shot's **window on the cut**, not its file end (`src/domain/timeline.ts:214-217`; `src/worker/handlers/take.ts:181-190`) | `endFrame − 22 … endFrame − 1` |
| Tail extraction | `tailClipArgs`: `-ss start/24 -t 22/24 -frames:v 22 -vf fps=24`, x264 crf 12, PCM mono 48 kHz in .mov (`src/server/media/ffmpeg.ts:132-149`) | picture and sound bounded to 22/24 s |
| Node wiring | `LoadVideo → GetVideoComponents` → `MiniMaxH3AddGuide.image` (output 0) and `.audio` (output 1) at `frame_idx 0` (`minimax-h3.ts:139-146`); music video: the song stretch replaces the tail sound (`take.ts:191-192`) | one AddGuide carries both streams |
| Tail sound muted | previous take speaks in its last 22 frames and this shot has no lines → frames only (`src/server/production/shot-pack.ts:91-97, 121-128`), measured C1/C1b vs C1c | — |
| Request length | `clipSecondsFor`: `newSeconds + 22/24`, capped at 15 s, `h3FrameCount` snaps up into 124–362 (`shot-pack.ts:187-194`; `minimax-h3.ts:19-31`) | ≤ 340 new frames (14.17 s) |
| Soundtrack guide | recorded dialogue / song at `frame_idx = trimStartFrames` (`take.ts:203`) | 22 on a continuation |
| Picture trim | `conformFilter`: `fps=24,select=gte(n\,22),setpts=N/FRAME_RATE/TB` (`src/server/media/assembly.ts:60-61`) | frame-exact |
| Audio trim | `sourceOffsetSamples = S(22) = 22 × 2000 = 44 000` at 48 kHz (`timeline.ts:83-85, 219, 317`); `aformat=48000 … atrim=start_sample=` (`src/server/media/mix.ts:66`) | sample-exact |
| Join smoothing | B starts 3 frames (6 000 samples) early, qsin fade-in; A qsin fade-out — unless a recorded line of A runs into its end (`timeline.ts:89, 323-336`) | 125 ms |
| Checks after the head | speech check from the head (`take.ts:313`), people count from the head (`take.ts:353`), take timeline `{newFrames, headFrames, clipFrames}` (`take.ts:399`) | — |
| Join QA | luma diff vs intra-shot p95, RMS step, spectral flux at every join (`src/server/media/assembly-joins.ts:20, 89-118`; `assembly.ts:109-113`) | floors 1.0 luma / 1.0 dB / 0.1 |
| Preflight | frames in range, continuation truncation warning, guide count ≤4 and fit (`src/server/org/preflight.ts:33, 55-59, 73-78`) | — |

### b.4 Which parts are specific to which MiniMax model

| Item | Applies to | Source |
|---|---|---|
| 17k+5 grid, 124–362 trained range, 24 fps, 40 Hz audio latent | local H3 open weights (both fl2va and ref2va) | SRC `:34-40`; SB `segmentation.py:25-30` |
| AddGuide 5/22/39 quantisation, frame+audio anchoring, crop to track | local H3 via ComfyUI core node only | SRC `:166-240` |
| 9 images / 3 videos / 3 audios; SB's 2–15 s per audio, 15 s total → 5.0 s each | `MiniMaxH3ReferenceToVideo` (ref2va); SB applies the 15 s total (`director.py:260-264`) | SB `prompts.py:22-23`; VB `minimax-h3.ts:14-17` |
| SB checkpoint `minimax_h3_hybrid_fl2va_ref2va_b20-49-int8`, video VAE fp16, turbo LoRA `minimax_h3_turbo_v4_step600_ema…`, 3D latent upscaler | SB only; **none present in VB** | README:41-45; `story_to_film.json` nodes 11, 15, 34 |
| VB checkpoints `minimax_h3_{fl2va,ref2va}_pruned_int8_convrot`, video VAE int8, LoRAs fl2v 8-step / ref2v 4-step | VB local | `src/server/workflows/index.ts:28-34`; `docker/models/manifest.json` |
| SB defaults 8 steps, `euler`/`beta`, shift 12/3, cfg 1 | SB's hybrid + turbo v4 | `director.py:33-39` — **do not copy**: VB measured `beta` + ref2v 4-step turbo as broken (E6a, ghosting) |
| Hosted MiniMax H3 API | no AddGuide, no anchored audio, frame and reference roles cannot be mixed | `docs/research/MINIMAX-CONTINUITY.md` §1.4; VB lowers to `LAST_FRAME_AS_FIRST` (`shot-pack.ts:129`). SB has **no** hosted path |

### b.5 Vewbox ComfyUI installation (read-only)

- `docker/comfyui/Dockerfile:3,6,19` — ComfyUI pinned to `v0.38.1`, "no custom video nodes"; `compose.yaml:118-134`
  mounts models, input/output and `extra_model_paths.yaml`, no `custom_nodes` volume. In the running container
  `/opt/comfyui/custom_nodes` holds only `example_node.py.example` and `websocket_image_save.py`.
- Every node VB's H3 graphs use is core (`comfy_extras.nodes_minimax_h3`, `LoadVideo`, `GetVideoComponents`).
  In-repo graphs that exercised the continuation: `docs/evidence/minimax-p1/C1*.graph.json` (C1: `LoadVideo` →
  `GetVideoComponents` → `MiniMaxH3AddGuide`, lines 211-226).
- SB's example workflow cannot run here as shipped: besides the hybrid checkpoint and latent upscaler it uses
  KJNodes (`MiniMaxLowVRAMAttention`, `MiniMaxChunkFeedForward`, `story_to_film.json:650-723`; `ModelPreviewOverrideKJ`
  `:736`) and `ResolutionSelector` (`:1106`). Nothing in it is needed by VB.
- `scripts/check-comfy-nodes.mjs:9-16` does **not** list `MiniMaxH3AddGuide`, `LoadVideo` or `GetVideoComponents`, so a
  ComfyUI upgrade that renamed them would pass the check and fail at job time (§f.9).

---

## (c) Reference mechanics per shot

| Kind | SB | VB today |
|---|---|---|
| Character image | One 2048² Krea2 head-and-shoulders portrait per seen character, every pixel face (`casting.py:1-15, 178-206`). Re-sent on every shot. `ref_image_size="match"` scales it to the generation's pixel area (`director.py:215-219`) | Canonical front full-body image (approved, versioned), legacy portrait fallback (`shot-pack.ts:134-151`); `match` default (`minimax-h3.ts:115`) |
| Location | One empty plate per location; **every** location the clip visits is sent (a take that cuts to another room carries both plates) and never dropped (`prompts.py:1152-1171, 1174-1206`) | One plate per shot: STATE for the scene's time of day, else MASTER (`shot-pack.ts:100-107`); World Bible plate choice by framing (`src/domain/world.ts:270`) |
| Slot order / budget | characters (LLM's importance order, POV moved last) then locations; characters trimmed from the end to fit 9 (`prompts.py:1194-1206`) | characters in shot order, then the plate, then the opening frame if bound; characters over budget dropped last-first (`shot-pack.ts:140-156`) |
| Binding | LLM writes `{{name}}`; resolved to `<Picture i>` / `<Audio j>` **after** the ref list is final (`prompts.py:1241-1265`, `director.py:114-131`). Subjects and pictures are separate namespaces: `<Subject N>` counts people, groups and places; `<Picture i>` counts only images sent (README:458-469) | `Subject k = Picture k` by construction (`shot-pack.ts:157-159`; `src/server/story/prompts.ts:107-120, 181-195`) |
| Character without a picture | still declared, from the full `appearance`, `weak_reference`, "render them from this description alone" (`prompts.py:799-823`) | listed in `pack.unreferenced` and warned (`take.ts:213`), **not declared** in `subject_definitions` (`prompts.ts:183-188`) |
| Crowds | `groups` in the cast; declared as picture-less subjects, "each one a separate individual … None of them shares the face … of <Subject k>", `weak_reference`, cost no picture slot (`prompts.py:857-878`; cast rules `SYSTEM_PROMPTS.txt:97-115`) | no group concept (no match in `src/domain/types.ts`); only the after-the-fact people count (`take.ts:353-358`) |
| POV | `pov` shot: character keeps a picture if room, goes last, `weak_reference`, "the camera is <Subject k>'s own eyes" (`prompts.py:824-832, 892-897`); ≤50 % of a scene (`planner.py:552-568`) | none |
| Retention lines | cite only the `[Shot N]` the subject is actually named in (`prompts.py:538-594, 838-841`); places cite only their own `[Shot N]` (`:494-508`) | every subject `appears in [Shot 1]` (`prompts.ts:205-206`) — correct while a take has one shot |
| Voice | optional `<Audio j>` timbre clip per **speaker of this shot** only, ≤3, 5.0 s each so 3 × 5 ≤ 15 s total; made by H3 from the portrait (`prompts.py:1209-1238`; `director.py:254-305`). "Guidance, not cloning" | Recorded dialogue (canonical voice) anchored as AddGuide audio at the first new frame (`take.ts:203`); timbre `<Audio j>` refs only without a soundtrack, speakers only, ≤3, **no duration or 15 s-total check** (`take.ts:243-250`) |
| Silent shot | `NO_DIALOGUE` mouth-closed clamp (`prompts.py:163-168`), speech verbs scrubbed from beats (`scrub_speech_prose`, `:747-764, 980-1116`), `vocals` field for singing/laughter (`:177-185, 907-911`) | "Nobody speaks in this shot." + "no dialogue and no voices" (`prompts.ts:216-222`) |

---

## (d) Hierarchical planning: story → scenes → shots → actions

**Hierarchy in SB code (not README).** Cast → outline (scenes) → one staging call per scene → **one clip per scene** →
2–10 timed beats inside the clip, of which ≤2 may open a new `[Shot N]`. So the levels are story / scene(=clip) /
in-take shot / beat (action). `_shot_frames()` always returns 362 (`planner.py:458-477`); the README table of
124/226/328/362 per-shot lengths (README:251-259) is stale. The film's clip count is arithmetic,
`ceil(len(story) / chars_per_clip)` with 225 chars = 15 s at 15 chars/s (`planner.py:773-779`; `segmentation.py:32-43`).

**Durations from action and dialogue.** The staging LLM times each beat "by how long its action really takes" (glance
≈1 s, door 3–4 s, crossing a room 5+ s) and dialogue at ~3 words/s (`prompts.py:1591-1602`); a shot holds ~45 words, a
longer quotation is split across shots at a sentence boundary (`:1700-1704`). Code then treats the LLM's beat lengths as
**ratios**, rescales them to the clip's real length, lifts any beat under `MIN_BEAT_SECONDS = 1.0` taking time from the
longest beats, and tiles the take with no gap or overlap (`planner.py:117-206`). Cuts are policed in code:
`MAX_CUTS = 2`, margin `min(3.0 s, 20 % of the shot)` from both ends (2.5 s for `montage`), cuts that change place or
time ranked first, and two cuts no closer than the margin (`planner.py:209-298`; tests
`tests/test_planner_beats.py:73-125`).

**Outline prompt key rules** (`prompts.py:1323-1427`): the second pass never sees the story, so cover all of it and
copy quoted lines verbatim; a scene is one 15 s clip and holds ~10 actions — more means split; list every discrete
visible action in `actions` (a comma list is several actions); `pace` = `montage` (listed successive actions) /
`dwell` (one moment expanded, no cuts) / `normal`; `time` = present / flashback / memory / dream / later with strict
definitions; retold events are staged **at** those events, not as the teller remembering; `moves_to` only when the
movement itself is the scene; groups whenever unnamed people are present.

**Staging prompt key rules** (`prompts.py:1430-1734`): stage the events, never the telling; shoot the listener, not the
talker (worked example without one speech verb); a place in use is shown in use; consecutive shots of one description
each take a different subject; every character the beats show is listed; unnamed people require a group, never an
invented crowd; POV only behind a barrier; with a character on screen framing is **medium, medium close-up or close-up
— never wide** (`:1477-1479, 1664-1667`; reason README:117-125: identity lives on face pixels); nobody looks at the
camera; beats are observable action only, uneven times, never equal spacing; cut only for a new place, time or
subject; when nobody is quoted no beat may name speech, not even as a trailing scrap; soundscape never vocal; music is
always N/A; never describe dissolves or on-screen text.

**Code backstops for LLM drift**: group names removed from `characters` (`planner.py:90-106`); shot cast reconciled
with the beats — anyone named is added, anyone never named who neither speaks nor is POV is dropped
(`planner.py:301-349`); a location not in the cast falls back to the **scene's** location, never the film's first
(`planner.py:352-371`); outline `time`/`pace` inherited when the shot says `present`/`normal` (`planner.py:660-666`);
cast-but-unused characters reported (`planner.py:856-873`). Note `SYSTEM_PROMPTS.txt:596-607` still documents
multi-window staging for scenes of >6 shots, which the code no longer does (`planner.py:633`, one shot per scene).

**VB today** (for contrast): scenes carry `beats: {action, lines}[]`, purpose, emotional objective, entry/exit state
(`src/domain/types.ts:81-96`); the shot planner asks for 3–10 s shots, "a dialogue line needs about 0.4 s per word
plus a beat" (`src/server/story/engine.ts:461-462`), clamps to 3–10 s (`:500`) and stretches shots to fill the scene
budget (`fitDurations`, `:523-532`); a shot has one `action` string and one camera (`types.ts:182-205`); the take
length then comes from the recorded lines, words + ≤2 s (`take.ts:145`). One shot = one generation = one `[Shot 1]`
(`prompts.ts:220`).

---

## (e) Gap list against Vewbox

### e.1 What SB does that VB lacks

| # | SB technique (citation) | VB today | Value | Priority |
|---|---|---|---|---|
| G1 | Timed beats inside a take: action-weighted ratios, 1 s floor, exact tiling (`planner.py:117-206`); rendered as `[M:SS]` point marks that do **not** read as cuts (`prompts.py:523-535, 676-680`) | one `action` string per shot (`types.ts:186-187`) | several actions per generation without an edit; pacing that follows the action | P1 |
| G2 | In-take hard cuts `[Shot N] At MM:SS.mmm, hard cut to …` with margins, ≤2 cuts, `HARD_CUTS_ONLY` clause (`planner.py:209-298`; `prompts.py:170-175, 597-681`) | single `[Shot 1]` (`prompts.ts:220`); an editorial cut costs a new generation and a new opening frame | an editorial cut with identity carried inside one latent, no join at all | P1 (behind a flag, G-test) |
| G3 | Outline `actions[]` coverage + `pace` (montage/dwell/normal) + `moves_to` (`prompts.py:1336-1360`) | beats exist, no pace, no explicit action list (`types.ts:81-96`) | stops action lists collapsing into one summary beat | P1 |
| G4 | Cast reconciled against the beats (`planner.py:301-349`) | names → continuity → speakers, no cross-check with the action text (`engine.ts:488-491`) | wrong or missing face in a shot | P1 |
| G5 | Over-budget / imageless characters declared from description, `weak_reference` (`prompts.py:799-823`) | warned, not declared (`take.ts:213`; `prompts.ts:183-188`) | nobody silently vanishes or appears unbound | P1 |
| G6 | Crowds as picture-less subjects with an explicit "distinct from" clause (`prompts.py:857-878`) | no groups; people count rejects afterwards (`take.ts:353-358`) | the "every extra wears the hero's face" failure prevented, not detected | P2 |
| G7 | POV shots (`prompts.py:824-832, 892-897`; `planner.py:552-568`) | none | barrier shots (peephole, door crack) staged correctly | P3 |
| G8 | Silent-shot speech scrubbing + mouth-closed clamp + `vocals` (`prompts.py:163-185, 747-764, 980-1116`) | one sentence (`prompts.ts:216-222`) | VB measured invented speech in silent continuations (C1/C1b) — the scrubber attacks one cause | P1 |
| G9 | Close framing whenever a character is on screen (`prompts.py:1477-1479, 1664-1667`) | WIDE allowed for character shots (`engine.ts:476`); E4a noted "face small in a wide frame" | identity holds on face pixels | P2 (G-test) |
| G10 | Time jumps rendered as physical looks (`prompts.py:187-218`) | none | flashback/memory read on screen | P3 |
| G11 | Frame-budget policy: refuse the guide (hard cut) rather than truncate the narration (`segmentation.py:85-98`; README:393-395) | truncate with a warning (`shot-pack.ts:187-194`; `preflight.ts:59`) | a continuation never loses planned content silently | P0 |
| G12 | Voice refs: speakers only, 5.0 s each, ≤15 s total (`director.py:260-264, 301-305`; `prompts.py:1209-1238`) | speakers only, ≤3, no duration validation (`take.ts:245-249`) | node rejects >15 s total / <2 s per clip | P0 |
| G13 | Render cache keyed on the exact prompt text (`project.py:194-209`) | provenance stores prompt; no persisted ShotPack hash (`MINIMAX-CONTINUITY.md` §8) | "another take" is the same request | P2 |

### e.2 What VB has that SB never shipped (keep; do not regress)

Tail + sound continuation through AddGuide with the window-end source frame; `speechInTail` mute rule; frame-exact
picture and sample-exact audio trim; 3-frame cross-fade; join QA; speech check and people count read after the head;
pilot gate; continuation waits for an accepted predecessor; recorded dialogue as an audio guide with ASR verification;
hosted lowering that refuses guides; prompt lint; the World Bible (`src/domain/world.ts:140, 270, 337, 387, 407`) with
ESTABLISHED plates; the production audio timeline. SB has none of these.

### e.3 VB continuation gaps not covered by SB either

| # | Gap | Evidence |
|---|---|---|
| V1 | Guide clip frame count never validated. `tailClipArgs` emits `n = min(22, end)` frames (`ffmpeg.ts:134-135`); with fewer than 22 the node floors to 5 (or 1) while `trimStartFrames` stays 22 (`shot-pack.ts:169`) → the cut drops up to 17 genuinely new frames | SRC `:203-211` |
| V2 | The head is assumed to be a repeat; nothing checks that the model honoured the guide or measures the actual offset before 22 frames are dropped | `assembly.ts:61` trims blindly; C1 PSNR was measured once by script, not in the pipeline |
| V3 | No stale chain: `continuesTakeId` is recorded (`types.ts:143`, `schema.ts:153`) but no code compares it with the predecessor's current `selectedTakeId` | grep: only types/schema/persist/snapshot/actions |
| V4 | Speaking continuation: no check that the words around the join are neither doubled nor lost (AT-5 in `MINIMAX-CONTINUITY.md` §6) | `assembly-joins.ts` measures luma/RMS/flux only |
| V5 | Node check misses `MiniMaxH3AddGuide`, `LoadVideo`, `GetVideoComponents` | `scripts/check-comfy-nodes.mjs:9-16` |

---

## (f) Integration plan for Vewbox

Ordered by risk: P0 needs no generation to verify; P1 changes requests and needs the G-tests in §g first.

### f.1 Guide-frame validation (P0, V1)
- `src/server/media/ffmpeg.ts`: `tailClip()` returns `{ file, frames, audioSamples, sampleRate }` from an `ffprobe`
  with `-count_frames`; new pure `validateGuideClip(probe, want)` → problems: `frames !== want` ·
  `h3GuideClipFrames(frames) !== frames` (not on 5/22/39) · `|audioSamples/sampleRate − frames/24| > 1/24` · no audio
  when `withAudio`.
- `src/worker/handlers/take.ts:190`: on any problem, fail the take `WRONG_PARAMETERS` before the GPU is touched (never
  let the node floor silently); record `guide: { frames, audioSamples }` in provenance (`take.ts:408`).
- `src/server/production/shot-pack.ts`: `continuationSource()` also requires the previous window to be ≥ 22 frames
  (`windowEndSourceFrame − sourceStart ≥ H3_GUIDE_FRAMES`); otherwise relation lowers to CUT with a note.

### f.2 Frame-budget validation (P0, G11)
- Planner (`engine.ts` after `:500`): a shot whose `continuity.relationToPrevious === 'CONTINUATION'` is held to
  `≤ (H3_MAX_FRAMES − H3_GUIDE_FRAMES)/24 = 14.17 s` of new content; longer ones are split there, not later.
- `shot-pack.ts` `clipSecondsFor`: return `fits: boolean`; new `ShotPack.budgetPolicy: 'HARD_CUT'` (SB's rule, default)
  — when `truncated`, the pack is rebuilt as CUT with `trimStartFrames = 0` and a note; `'TRUNCATE'` kept only as an
  explicit producer override. `preflight.ts:59` becomes a check (`continuation-fits`), not a warning.
- Every request: `frames % 17 === 5`, `124 ≤ frames ≤ 362`, `trimStartFrames + newFrames ≤ frames`, soundtrack guide
  at `trimStartFrames` fits (already `guideProblems`, `shot-pack.ts:212-214`).
- Reference audio (G12): each `<Audio j>` 2–15 s, total ≤ 15 s; trim to `15/n` s like SB (`director.py:260-264`) in
  `take.ts:245-249`; preflight check `reference-audio-budget`.

### f.3 Duplicate-frame removal, verified (P0 code, thresholds from §g)
- `src/server/media/assembly-joins.ts`: `measureGuideHead(takeFile, tailFile, g)` → per-frame PSNR of take frames
  `0 … g+2` against tail frames; returns `{ meanPsnr, lastMatchIndex }` (the take frame best matching the tail's last
  frame).
- `take.ts` after generation (before QA): store `params.guideHead`. **Timestamp correction**: if `lastMatchIndex ∈
  [g−3, g+1]` and ≠ `g−1`, set `trimStartFrames = lastMatchIndex + 1` on the take (`src/domain/actions.ts:301` already
  carries the field); everything downstream already reads it (`timeline.ts:194, 283`, `assembly.ts:61, 193`,
  `take.ts:313, 353`). If `meanPsnr` is below the floor (C1 measured 38.7 dB; floor set by G1), QA check
  `guide-honoured` fails the take (`failureClass: 'CONTINUITY'`), not the cut.

### f.4 Duplicate-audio removal and timestamp correction (P0/P1)
- Audio trim stays sample-exact from the (possibly corrected) `trimStartFrames`: `S(trim) = trim × 2000` at 48 kHz
  (`timeline.ts:219, 317`). Keep the 3-frame qsin cross-fade (§b.2: the boundary is never on an audio-latent step).
- Dialogue windows written by the speech check are take-relative and shifted by `head` (`timeline.ts:283`,
  `assembly.ts:193`): when f.3 moves the trim, rewrite nothing — the windows follow automatically; add a test.
- V4: `speechJoinCheck` in `assembly-joins.ts` for CONTINUATION joins where either side speaks: ASR the mixed cut over
  `[join − 2 s, join + 2 s]`, compare against the script words of both shots in order; doubled or missing words flag
  the join (provenance), which is AT-5.

### f.5 Stale continuation chain (P0, V3)
- `src/domain/timeline.ts` `buildAudioTimeline`: for a CONTINUATION shot, `take.continuesTakeId !==
  previous.selectedTakeId` → `problems.push({ kind: 'STALE_JOIN' })`; `assemble.ts` refuses unless overridden.
- `Take.status` gains `STALE` (`types.ts:98`), set by the select-take action on dependants; PRODUCE regenerates them
  in order (`MINIMAX-CONTINUITY.md` §3.6).

### f.6 The three shot-boundary cases (plus SB's in-take cut)

| Case | Request (local) | Prompt | Assembly | Validation |
|---|---|---|---|---|
| **Continuous action** (CONTINUATION, same scene, accepted predecessor) | tail 22 f + sound (or frames only per `speechInTail`) at 0; canonical refs + plate; soundtrack guide at 22; no opening frame | summary "continues the previous shot without a cut … first 0.9 s"; describe motion forward only | trim 22 (or f.3-corrected) frames and S(trim) samples; 3-frame audio cross-fade; join QA | f.1, f.2 (HARD_CUT fallback), f.3, f.5 |
| **Editorial cut** (CUT, same moment, new angle) | drawn opening frame (previous end state) as `<Picture k>` + AddGuide at 0; refs; no tail | `It begins from <Picture k>, a new camera angle on the same moment` | hard cut, 10 ms edge fades; scene ambience bed continuous | screen direction/props carried (existing continuity); **option**: if the previous shot is short and the next angle is planned in the same scene, render both as one take with an in-take cut (below) |
| **Scene transition** (STORY_TRANSITION) | destination plate (STATE/ESTABLISHED), fresh opening frame; previous shot contributes nothing | time looks (G10) when the scene is a flashback/memory | honour DISSOLVE/FADE; new ambience | plate locked/established per World Bible |
| **In-take cut** (new, SB G2) | one generation; no join | `[Shot 1] …` then `[Shot 2] At 00:05.000, hard cut to <camera>[ in <Subject k>]. …`, `HARD_CUTS_ONLY`; retention cites per-`[Shot N]` | none (single take); subtitles unchanged | margins `min(3.0 s, 20 %)` (2.5 s montage), ≤2 cuts, cut-to-place must name a plate in the pack |

Data model (P1): `Shot.beats?: Array<{ at: number; action: string; cut?: { camera: string; locationId?: string; time?:
'FLASHBACK' | 'MEMORY' | 'DREAM' | 'LATER' } }>`, `Shot.pace?: 'DWELL' | 'NORMAL' | 'MONTAGE'`,
`Scene.actions?: string[]`, `Scene.movesToLocationId?: string`, `Production.groups?: Array<{ id; name; size;
description }>` (picture-less crowds), `Shot.groupIds?: string[]`, `Shot.pov?: string`. Pure helpers ported from SB into
`src/server/story/beats.ts`: `beatWeights`, `cleanBeats`, `limitCuts`, `reconcileCast` (MIT notice if near-verbatim).
`shot-pack.ts`: `pictures` gains a second LOCATION when a beat cuts to another place (never dropped, like SB).

### f.7 Planner and prompt changes (P1)
- `engine.ts:462` prompt: per-beat timing by action length, uneven spacing, dialogue ~3 words/s (VB's 0.4 s/word is
  equivalent); outline/staging rules from §d adapted to VB's multi-shot scenes (VB keeps shot = generation; beats are
  inside it). Backstops in code (G4, cut limits, scene-location fallback).
- `prompts.ts` `h3ReferencePrompt`: declare unreferenced characters (G5) and groups (G6) as `weak_reference` subjects
  **after** the pictured ones (lint `subjects-defined` must accept "is … No reference picture" definitions,
  `prompts.ts:253`); per-`[Shot N]` retention; `[M:SS]` beat marks; silent-shot scrubber (G8); `vocals` section.

### f.8 What not to take
SB's hard-cut-only joins (VB's measured guide join works); its hybrid checkpoint, 928×544, `euler`/`beta`/8 steps
(`beta` broke ref2v 4-step turbo, E6a); H3-rendered voice samples (VB's canonical recorded voice is authoritative and
ASR-checked); one clip per scene at a fixed 15 s (VB plans dialogue-first windows); its file-based project store.

### f.9 Tooling (P0)
`scripts/check-comfy-nodes.mjs:9-16`: add `MiniMaxH3AddGuide: ['positive', 'latent', 'frame_idx', 'vae', 'audio_vae',
'image', 'audio']`, `LoadVideo: ['file']`, `GetVideoComponents: ['video']`.

### f.10 Tests
| Test | File | Asserts |
|---|---|---|
| guide clip validation | `tests/unit/continuation-media.test.ts` | 22 f + 0.9167 s audio passes; 21 f, 5 f, no audio, 0.5 s audio fail; real ffmpeg on a 30-frame source and on a 15-frame window (short-window → CUT) |
| frame budget | `tests/unit/take-continuity.test.ts` | new 14.17 s fits (362); 14.2 s → HARD_CUT pack with trim 0; every request `% 17 === 5`, 124–362; SB parity table (124→158, 226→260, 328→362, 345→refuse) |
| reference audio budget | `tests/unit/preflight.test.ts` | 3 × 6 s → trimmed to 5 s each; 1.5 s clip refused |
| head measurement / timestamp correction | `tests/unit/assembly-media.test.ts` | synthetic take whose head repeats a tail with a +1 frame offset → `trimStartFrames` 23; windows and `sourceOffsetSamples` shift by 2000 |
| stale join | `tests/unit/mix-plan.test.ts` | re-selected predecessor → `STALE_JOIN` problem; assemble refuses |
| beats and in-take cuts | `tests/unit/beats.test.ts` (new) | ports of SB `tests/test_planner_beats.py:34-125` (ratios kept, tiling exact, 1 s floor, cut margins, ≤2 cuts, place/time cuts ranked first) |
| prompt grammar | `tests/unit/take-prompt.test.ts` | `[Shot 2] At 00:05.000, hard cut to … in <Subject k>`; unreferenced and group subjects defined; retention per shot; lint passes |
| node check | `scripts/check-comfy-nodes.mjs` run | three nodes present on v0.38.1 |

---

## (g) Open questions that need a real generation once generation resumes

| # | Question | Setup (local H3, ref2va, 4-step turbo, `simple`, 1280×736) | Decides |
|---|---|---|---|
| Q1 | Does the take's head reproduce the tail at the expected offset, every time? Distribution of `lastMatchIndex` and PSNR over ≥5 seeds × 3 shots | f.3 measurement on continuations | the PSNR floor and the ±offset window of timestamp correction |
| Q2 | Is SB's "stutter at the join" visible after VB's trim + cross-fade? | 3 continuation joins vs the same shots hard-cut with refs only (SB's method); blind rating + join QA | whether CONTINUATION stays the default for same-scene action |
| Q3 | 5 vs 22 vs 39 guide frames on ref2va (E5) | one action split in 3 | `H3_GUIDE_FRAMES` (never assume 22 is universal) |
| Q4 | Tail sound: when does anchoring it make H3 keep talking (C1/C1b, one seed) | ≥5 seeds, silent vs speaking next shot | the `speechInTail` rule |
| Q5 | Does an in-take cut keep identity and place as well as two takes? | same two angles: one take with `[Shot 2] At 00:06.000` vs two CUT takes | G2 enabled by default or not |
| Q6 | Do timed `[M:SS]` beat marks hold their times? | 4 actions in one 10 s take; measure action onsets | beat timing in prompts |
| Q7 | Close framing vs WIDE for identity | same shot MCU vs WIDE, canonical full-body ref | G9 framing rule |
| Q8 | Picture-less subjects (groups, over-budget characters) — do extras stay distinct? | 1 named + 4 extras, with/without group subject | G5/G6 |
| Q9 | Audio boundary: is 3 frames of cross-fade enough given 36.67 latent steps per 22 frames? | join RMS/flux at k = 0, 3, 6 | `JOIN_CROSSFADE_FRAMES` |
| Q10 | Max new content after the guide: is 340 new frames (362 total) as clean as 136? | 158- vs 362-frame continuations | whether the planner caps continuations below 14.17 s |
| Q11 | Hosted continuation (needs a key): last-frame-as-first vs `reference_video` | 2-shot chain | hosted CONTINUATION lowering (E12) |
| Q12 | SB's README claim itself: did the 22 f + audio join ever work for its author? | not testable from code — ask upstream (issue) | nothing blocks on it |
