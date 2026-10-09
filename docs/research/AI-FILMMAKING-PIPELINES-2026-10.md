# AI filmmaking pipelines — research pass before the orchestration rebuild (2026-10-09)

Research for the producer's 2026-10-09 request: how current professional AI film/video systems and human production
practice handle identity, references, storyboards, shot lists, continuity, bibles, audio-first dialogue, music-video
direction and the singer-as-performer problem — then a system design extract for Vewbox. System design ideas only; no
proprietary brand, character or look is copied.

Grounding: [PRODUCTION-EXECUTION-STATUS.md](../PRODUCTION-EXECUTION-STATUS.md) (clean restart, Phase 1) and the
engineering history in
[archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md](../archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md).
This document does not repeat [CONTINUITY-GAPS-2026-10-06.md](CONTINUITY-GAPS-2026-10-06.md); it builds on it.

Source quality is marked: **[official]** model documentation, **[paper]** peer-reviewed or arXiv, **[oss]** open-source
repository, **[craft]** human production practice, **[vendor]** AI-tool marketing (useful for patterns, not for claims).

---

## Part 0 — What actually failed here (the problems the recommendations must solve)

From the engineering history (real media, 2026-10-07 → 10-09):

| # | Failure seen in media | Root cause found | Status in code |
| --- | --- | --- | --- |
| F1 | Adjacent shots "felt independently generated"; a cut landed in what looked like a new place (invented room, white walls) | Every shot composed fresh from the same wide plate + canonical portrait; nothing actual handed to the next shot; insert background described from the place's name only | Partly fixed (take-end DERIVED asset as reference; insert background from place identity) |
| F2 | H3 cut or morphed inside a take (4 of 7 takes in scene 2; 1.4 attempts 1-3; 1.6 attempts 3-4) | The prompt contradicted the frame: re-stated positions/facing ("is center, faces screen left"), described the whole staging into an insert, said "continues without a cut" and "locked off" over a tail of a different framing, planned WIDE vs actual medium close-up at the previous take's end | Fixed case by case: words describe only what the shot can show; camera written from the ACTUAL end framing |
| F3 | Dry → soaked → dry suit; a forehead wound appears; the lens assembly is a different object per shot | Condition lives in the plan text, not in a picture; the plate's object was never a reference | Partly fixed (previous end as reference carries condition) |
| F4 | Scars drawn as fresh red cuts (3 of 3 characters), mole drawn on the sweater, side-specific details mirrored (4 of 4) | Image models render "scar" as a wound; left/right from the viewer; details under wardrobe cannot be drawn | Wording fixes did not solve the scar; image is the authority; mole removed |
| F5 | The opening frame did not realise the shot (INSERT came out a medium; "soaked" took in 1 of 6 frames; smile vs strained) | A crop of a wide plate is not a frame; the portrait's expression overrides text; expression written into look fields | Expression edit stage + face gate; INSERT drawn from words; framing measured |
| F6 | Group frame: Marcus twice, a stranger, a third person | Multi-person composition in one edit pass | Fixed: staged one person at a time |
| F7 | Line said twice; "Hold" sound before mouth; lip-sync −4 frames | H3 repeats a short line in a ≥5 s clip; the measure correlated loudness with mouth opening | Prompt timed beats; calibration from one clip (fragile) |
| F8 | Identity drift 0.21-0.22 within a take; edited frame's face morphs back toward canonical | The edit pass lost the beard; H3 pulls toward the bound canonical image | Name hair/facial hair in the edit; still REVIEW |
| F9 | Singer identity: ACE-Step timbre reference does not transfer identity; SVC candidate not approved | Model capability, licensing | WAITING |
| F10 | Iraqi speech robotic (Habibi parity proven); not a Vewbox defect | Model + prompt | WAITING_FOR_USER |
| F11 | Planner slips: lens vs window, "beneathfoot", near-identical padded shots, static-camera sentence over a continuous boundary, detail shots called close-ups | Prompt/schema gaps | Fixed one by one |

The pattern: **the plan was right; the state was lost between plan and pixels**, and **words re-staged what pictures
already showed**. Everything below is read against that.

---

## Part 1 — Findings per topic

### 1.1 Character consistency

**What the field converged on (2025-2026).**

- *Lock references before any video; drive every shot from locked assets.* The vendor literature (invideo, CapCut,
  VideoGen) all describe the same discipline: multi-angle character sheets (front, side, profile, back + face
  close-up), one chosen and locked, attached to every generation together with a **stable identity wording block**;
  scene-specific words (location, action, framing, light) are the only variable part.
  [vendor] https://invideo.io/faq/how-do-you-create-a-character-bible-for-ai-video-to-lock/ ·
  https://www.capcut.com/create/ai-character-consistency-long-form-video-early-2026 ·
  https://videogen.io/blog/character-consistency-in-storyboard-to-video
- *Consistency is five independent layers that fail separately:* identity (face), visual design (hair, wardrobe,
  accessories, proportions), within-shot stability, cross-shot continuity, performance/story state (posture, energy,
  emotion, props, place in the action). [vendor] CapCut, above. This maps exactly onto F3/F5/F8: Vewbox measured
  layer 1 (SFace) while layers 2 and 5 were failing.
- *The first clear appearance sets the consistency ceiling.* GroundShot (arXiv 2606.20799, 2026) argues viewers judge
  every later appearance against the first clear one; it builds an **entity-level visual memory online from accepted
  shots**, verifies an entity's reliability before storing it, and **schedules shot generation by expected usefulness
  as a reference** (not narrative order). [paper] https://arxiv.org/abs/2606.20799
- *Memory that is updated after each shot.* VideoMemory (arXiv 2601.03655): a Dynamic Memory Bank of explicit visual
  and semantic descriptors per character, prop and background, retrieved before each shot and **updated after each
  shot to reflect story changes while preserving identity**. [paper] https://arxiv.org/abs/2601.03655
- *Holistic multi-shot models* (HoloCine, Captain Cinema, LCT, ShotAdapter) keep identity by generating all shots of a
  scene in one pass with shared attention and per-shot captions. They are research licences (HoloCine CC BY-NC-SA)
  and not in the frozen stack, but their **prompt format** is a usable design: one global caption (scene, characters,
  setting) + one caption per shot + `[character1]` placeholders. [paper/oss] https://github.com/yihao-meng/HoloCine ·
  https://arxiv.org/abs/2507.18634 · https://arxiv.org/abs/2503.10589 · https://arxiv.org/abs/2505.07652
- *Faces that are small in frame lose identity.* Both the Kapwing H3 guide and CONTINUITY-GAPS gap 8 (≈124 px of face
  in a full-body canonical at 1344×768): design identity beats as medium or closer; keep a derived face crop as a
  reference. [vendor] https://www.kapwing.com/resources/how-to-prompt-minimax-h3-hailuo-3-0-a-guide-for-ai-video-creators/

**Human practice that the AI tools rediscovered.** Wardrobe departments keep **breakdown charts**: how a garment
changes across scenes (dirt, wetness, tears) and several copies of the same outfit at different distress stages;
continuity photos pin wardrobe, hair, props and *costume condition* per scene because scenes shoot out of order.
[craft] https://howtofilmschool.com/dictionary/polaroid-continuity-photo/ ·
https://frankbeddor.com/whos-in-charge-of-the-chaos-of-wicked-the-movie/

**Reading for Vewbox.** The canonical image rule (one front full-body image is the authority; metadata describes the
image) is right and matches GroundShot's "first clear appearance" principle. What is missing is the *state* layer: a
character has one identity but several **looks-in-state** (dry suit / soaked suit; coat on / coat off; day 1 / day 3),
and each state needs its own picture, drawn once from the canonical image by the edit path and approved — the wardrobe
breakdown chart, as pictures. F3 and F5 are state failures, not identity failures. Scars (F4) are a distinguishing
detail the image models cannot render stably; prefer details models render reliably (hair shape, glasses, jewellery,
wardrobe signature, build) and keep a scar only if the canonical image already shows it healed.

### 1.2 Multi-reference generation and reference conditioning

**MiniMax H3 — official reference-to-video grammar** [official]
https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md and the base guide
https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md (via
https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3/workflow):

- Six ordered sections: `subject_definitions`, `summary` (task-type prefix: keyframe completion, reference generation,
  video editing, video continuation, audio reuse, audio reference), `retention_analysis`, `detailed_description`,
  `overall_soundscape`, `non_diegetic_music`.
- Labels: **`<Subject N>`** is a *content unit* (a person, object, environment, costume, style, pose), not a file; one
  subject may draw on several assets. **`<Picture N>`** is used *only* as a concrete frame anchor (first/key/last frame)
  or a storyboard reference — an image that only defines a character or scene is cited *inside* the Subject
  definition, never as a Picture. **`<Video N>`** is reserved for whole-video relationships: editing, **continuing from
  it**, or borrowing its camera movement/cuts/rhythm. **`<Audio N>`** is a standalone audio or a video's track.
- Retention levels, visible: `fully_preserved`, `partially_preserved`, `attribute_transfer` (traits move to a different
  identifiable subject, e.g. a jacket's colour/material onto another person), `weak_reference`. Audio: `fully_copy`
  (the source audio **is** the target's complete final track), `partially_copy`, `reference` (timbre/rhythm/dialogue
  content only, signal not copied), `weak_reference`. "New actions, backgrounds or plot events are not counted as
  fidelity losses."
- `detailed_description`: one or two style sentences, `[Shot 1]` without timestamp, later `[Shot N] At MM:SS.mmm`;
  introduce each Subject with its referenced traits at first clear appearance, then **reuse the label without
  redefining it**; "the shot begins from `<Picture 1>`"; 350-500 words for generation, dialogue-dense content fits the
  spoken timeline instead.
- Speakers: `(Sx)` in order of actual vocal events; `<Subject N> (Sx)` when the subject physically speaks; off-screen
  marked; dialogue and lyrics in `<d>[Language] ...</d>` verbatim; `[unclear]` never guessed; when only timbre/delivery
  is referenced, do not carry the original words.
- Base guide: "A cut should introduce new information about the subject, space, state, viewpoint, or time. If only the
  distance or a slight angle needs to change, prefer camera motion." I2VA: anchor `<Picture 1>` at 0.00 s, describe
  style, subjects, composition and scene anchors *from the image*, then the action: first-frame anchor → action onset
  → continuous development → result. FL2VA "favors a single shot"; describe the motion path, not two static
  descriptions. Voiceover: say the on-screen character's lips remain closed. Camera: motion type, amplitude, speed as a
  natural sentence; amplitude/speed only when meaningful.
- Limits (base, open weights): up to 9 reference images, 3 reference videos, 3 reference audio clips, each 2-15 s,
  total reference video and audio capped at 15 s each; audio reference requires at least one image or video.
  Reference media cannot be combined with first/last frame in one request (third-party API docs:
  https://developer.civitai.com/orchestration/recipes/minimax-h3).

Third-party H3 guides add one rule worth keeping: **give every reference one job and say what should transfer and what
to ignore** ("Video 1 defines the hand trajectory and movement timing only"; "Use the lighting from Image 1. Ignore
lighting cues from Image 2"), and design around the failure modes (small faces, very fast motion) rather than
prompting through them. [vendor] Kapwing (above) ·
https://hackernoon.com/minimax-h3-prompt-guide-how-to-write-better-hailuo-30-video-prompts

**Qwen-Image-Edit-2511** [official] https://huggingface.co/Qwen/Qwen-Image-Edit-2511 ·
https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511: multi-image input as an ordered list; 2511 claims
reduced image drift, better character consistency under imaginative edits, **multi-person consistency ("fusion of two
separate person images into a coherent group shot")**, and viewpoint generation built in (LoRAs folded into the base).
Subjects are referred to **by position** ("the magician bear is on the left"), not by image number. Independent work
(UniRef-Image-Edit, arXiv 2602.14186) notes 2511 is in practice limited to 2-3 reference inputs. The official card
gives no ordering rules and no limits; treat two references (identity + plate, or person + previous end) as the safe
ceiling and stage more people one pass at a time — which is exactly what F6 forced.

**Other reference systems (pattern only).** Runway's References: up to three active references, saved and **named**,
referenced in the prompt by `@name` or by upload order ("image 1"). [official]
https://help.runwayml.com/hc/en-us/articles/40042718905875-Gen-4-Image-References-Guide. Kling Elements: 1-4 images,
each typed as person / animal / object / scene, so the prompt never re-describes them. [vendor]
https://www.atlascloud.ai/blog/guides/how-to-use-kling-3.0-for-character-consistency. The shared idea: **named,
typed references that the prompt points at instead of re-describing.** H3's `<Subject N>` is the same idea.

### 1.3 Storyboard-to-shot workflows and shot lists

- Pipelines in the open: ArcReel (novel/script → character, scene, prop assets → structured script → storyboard images
  incl. multi-panel grids → clips → composite; stages confirmable, assets regenerable, rollback, resumable) [oss]
  https://github.com/ArcReel/ArcReel; Vivijure (browser planner → local keyframes → I2V, AGPL) [oss]
  https://www.creativeainews.com/blog/vivijure-self-hosted-ai-film-studio/; legend.video (prompt → storyboard of
  scenes/shots → stills per shot → video from stills) [oss] https://github.com/gaborcselle/legend.video; MovieAgent
  (director / screenwriter / storyboard artist / location manager agents over a script + **character bank**) [paper]
  https://arxiv.org/abs/2503.07314; StoryAgent (story design → storyboard → video → coordination → evaluation agents)
  [paper] https://arxiv.org/abs/2411.04925; AniME (shot descriptors + keyframes + asset memory) [paper]
  https://arxiv.org/abs/2508.18781; StoryBlender (3D-grounded storyboards; **continuity memory graph separating global
  assets from shot-specific variables**; engine-verified correction loop) [paper] https://arxiv.org/abs/2604.03315;
  Captain Cinema (top-down keyframe planning, bottom-up video synthesis) [paper] https://arxiv.org/abs/2507.18634.
- Every one of them is **frames first**: a storyboard still per shot is approved before motion. Captain Cinema and the
  ComfyUI "coherent scenes" workflows (Qwen-Image-Edit keyframes → Wan I2V → stitch) are the same shape.
  https://www.runcomfy.com/comfyui-workflows/create-coherent-scenes-qwen-image-edit-wan-2-2-in-comfyui-cinematic-coherence-workflow
- Human shot lists [craft] https://171entertainment.com/guides/music-video-storyboard-guide/: a panel shows framing,
  subject position, shot type, camera movement, action, timestamp/lyric; technical notes add setup, lens, lighting;
  a DP walks every panel for feasibility before it is distributed; the shot list is the working document (number,
  setup, movement, lens, shot type, time). Group by location and lighting, not by story order.

**Reading for Vewbox.** The storyboard card already exists. What the field does that Vewbox did not: the storyboard
frame is **the realisation of the shot, checked against the plan before filming** (F5), and it is drawn from the
*state* the shot needs (wardrobe state, props, previous end), not from a crop of a plate. "Feasibility" has an AI
equivalent: a boundary that cannot be one camera move (detail → wide two-shot with a newcomer) is refused at plan time
— which Vewbox learned on 1.7.

### 1.4 Scene continuity and the actual-end-state handoff

- *Last-frame chaining is the weakest handoff.* A still carries appearance but no camera motion vector, no
  micro-movement, no lighting state; the last frame is usually the worst frame to chain from because the model has
  already slowed down. *Reference-to-video chaining* passes the **closing seconds of motion** plus the character
  sheet and location plate in one call; swap in a new sheet when appearance changes; keep location/light fixed; if the
  prompt's camera conflicts with the tail's motion, align the prompt to the tail or restart the chain at that beat.
  Budget overgeneration (one production: ~3 generations per usable segment). [vendor]
  https://invideo.io/faq/what-is-reference-to-video-chaining-in-ai-filmmaking-and/ ·
  https://hackernoon.com/how-to-chain-ai-video-clips-into-one-shot-without-the-hidden-stutter-at-every-cut ·
  https://hackernoon.com/how-to-extend-an-ai-generated-video-clip-past-its-length-limit-without-the-drift
- *Memory updated from what was generated, after reliability checks* (GroundShot, VideoMemory, above) — the AI form
  of the script supervisor's log.
- *Script supervisor practice* [craft] https://nofilmschool.com/what-does-script-supervisor-do ·
  https://howtofilmschool.com/dictionary/continuity-film/: the log records per take the action, hand used, screen
  direction, wardrobe/prop state, and which take the director liked; **match on action** finishes in shot B the action
  started in shot A; the 180° line is held per scene. The log is written from what was *shot*, not from the script.

**Reading for Vewbox.** Continuity handoff v2 (take-end frame as a reference) was the right direction and F2's
attempts proved the remaining half: the **ACTUAL** end state must drive *everything* the next shot receives — the
reference pictures, the framing the camera sentence starts from, the condition words, and the boundary type — and the
planned state becomes a fallback. H3's official `<Video N>` *video continuation* role is the native way to pass the
tail *with motion* (2-15 s); Vewbox used the frame, not the tail, for cuts. For CONTINUOUS boundaries the tail
(FL2VA/anchored tail) was already used; for CUTS the last 2-3 s as `<Video 1>` with `partially_preserved` (same
people, place, light; new framing) is the untested option worth one controlled test.

### 1.5 Visual, character and location bibles

- *Production design "visual bible" / lookbook* [craft] https://www.thewrap.com/dune-production-design-visual-bible ·
  https://www.studiobinder.com/blog/film-lookbook/: references for every prop, costume ideas, locations, the visual
  language per world; a lookbook is organised by lighting, set design, composition, lenses, colour — or by location
  or by plot — and serves as the shared visual reference for every department, forcing lighting/lens/composition
  decisions before pre-production.
- *AI "director's bible"*: a structured document encoding camera, lighting, palette, composition, mood and sound as
  enforceable directives, loaded before any frame is generated; a *series bible* (characters, locations, lore, visual
  rules) persists across episodes and **each finished episode becomes the visual reference for the next**. [vendor]
  https://invideo.io/faq/what-is-a-directors-bible-for-ai-filmmaking-and-how-do/ ·
  https://invideo.io/faq/how-do-you-create-an-ai-video-series-with-consistent/
- *Five locked layers:* character, wardrobe & props, world, style, motion. [vendor] invideo (above).
- *Location as an identity with light rules:* CONTINUITY-GAPS gap 6 already defines `LocationLight`; the plate's
  *objects* (the lens assembly, F3) belong to the location bible as named props with pictures, not as prose.

**Reading for Vewbox.** Vewbox has the pieces (World Bible, production direction/style, location plates, LocationLight,
continuity state) but no single **bible object per production that every prompt is built from and every QA checks
against**. The bible should be data with pictures, not prose: for each character the canonical image + identity block
+ state sheets; for each location the master plate + named hero props with crops + light rules per time of day; for the
production the palette/lens/camera grammar as a fixed prompt block. Prose bibles are where re-staging words come from.

### 1.6 Audio-first dialogue

- "Pre-record-then-generate" is the 2026 norm for dialogue shots: lock every line's audio (human or TTS) before any
  shot, pass the audio + script + character reference together, set clip duration from the audio, perform the line at
  real pace (silent reading runs fast), and record emphasis and pauses because "flat audio gives a flat face".
  [vendor/craft] https://invideo.io/faq/what-is-the-pre-record-then-generate-workflow-for-ai/ ·
  https://hackernoon.com/an-audio-first-workflow-for-ai-video-dialogue-shots ·
  https://www.atlascloud.ai/blog/guides/audio-first-ai-video-workflow · https://higgsfield.ai/blog/make-ai-lipsync-videos
- H3's official grammar supports it natively: `<Audio N>` with `fully_copy` ("the source audio is the target's complete
  final audio track") and `<Subject N> (S1)` physically speaking, with the line verbatim in `<d>[English] ...</d>`.
  [official] ref guide (above).
- Audio-driven performer models (image + audio → video) are the other route: InfiniteTalk (Apache-2.0; video+audio
  dubbing or image+audio; streaming mode to ~40 s default, image-to-video good to ~1 min; audio CFG 3-5 best for lip
  sync; FusionX LoRA weakens identity) [oss] https://github.com/MeiGen-AI/InfiniteTalk; Wan2.2-S2V-14B (Apache-2.0;
  reference image + audio + optional text + optional pose video; length follows the audio; 480p/720p; demo includes a
  singing clip) [official] https://huggingface.co/Wan-AI/Wan2.2-S2V-14B; OmniHuman-1 (talking **and singing**,
  face-to-full-body, not released) [paper] https://arxiv.org/abs/2502.01061; StableAvatar (infinite-length audio-driven)
  [paper] https://arxiv.org/html/2508.08248v1.
- Lip-sync measurement: LSE-C/LSE-D from SyncNet (Wav2Lip, arXiv 2008.10010) are the de-facto metrics; they correlate
  weakly with humans (r≈0.36 reported), are sensitive to crop/brightness, and recent methods beat ground truth on them;
  report a human judgement alongside. [paper] https://arxiv.org/pdf/2008.10010 · https://arxiv.org/pdf/2511.04520.
  This matches F7: Vewbox's loudness-vs-mouth correlation was calibrated on one clip; a SyncNet-style offset (with its
  known limits) is the standard replacement, and the producer's eye stays authoritative.

**Reading for Vewbox.** Audio-first is already the Vewbox rule. The gap is that H3 was asked to *speak* the line (and
repeated it, F7) rather than being told the recorded audio **is** the final track (`fully_copy`) with the exact window;
and that nothing audio-driven exists for the performance layer (see 1.8).

### 1.7 Music-video direction (human practice)

- *Treatment* [craft] https://pixo.video/blog/music-video-treatment · https://blog.celtx.com/?p=15897 ·
  https://resolvemediagroup.com/news/p/music-video-treatments-what-why-and-how/: logline (a hook); concept and
  narrative in present tense **traced against the song's structure** ("what we see in the verses, what changes at the
  chorus, where it ends"; "on the second chorus, the doors open" beats "themes of liberation"); 4-8 visual references +
  a named palette + touchstones; cinematography & look (movement, lens feel, grain, light, aspect); locations &
  casting; a scene breakdown of 5-8 beats mapped to sections; an "Out" line naming the final image. A treatment that
  could fit any song is the red flag.
- *Design the chorus first*: it is the hero visual moment and sets the visual language; a recurring motif returns with
  each chorus so repetition reads as intention. [craft] 171 Entertainment (above) ·
  https://storyflow.so/blog/how-to-plan-a-music-video
- *Three jobs per shot — performance, story, atmosphere/B-roll* — each scene serves one purpose at that moment.
  Performance leads when identity, delivery or emotional emphasis is the point (the chorus is the artist's identity
  moment, anchored by a repeatable performance image); story takes over for consequence, relationship, memory,
  transformation; atmosphere for instrumental passages, transitions, repeats, emotional pauses, and to make the video
  feel like one place. Section guide: intro = world/atmosphere before performance; verse 1 = story or controlled
  performance introducing the problem; pre/build = raise motion, short performance inserts; chorus = strongest
  performance anchor + one motif; verse 2 = expand/relocate while keeping the artist available; bridge = reduce or
  remove performance if the song turns inward; final chorus = performance at greater scale or payoff; outro = resolve
  through story, motif or atmosphere, not more singing. Starting ratio ≈ 40/40/20, changed only when the song gives a
  reason. Failure patterns: singing that repeats the same information in every scene; story scenes where nothing
  changes; beauty shots outside the established world; a chorus without a visual anchor; no bridge/chorus contrast.
  [vendor, but craft-derived] https://jackrighteous.com/blogs/ai-art-visuals-creatives/atlabs-performance-vs-story-scenes-ai-music-video
- *Coverage and playback* [craft] https://filmtvsound.com/index.php/audio-techniques/198-shooting-to-sync-playback ·
  https://www.dvxuser.com/threads/how-to-shoot-and-sync-a-music-video.97535/post-97535 ·
  https://agent.vizard.ai/how-to/cut-a-music-video-from-your-performance-takes.html: shoot the **full song** at least
  three times (wide, medium, close) with the master played back so the performer mimes to it; a static full-song wide
  is the edit's backbone and safety net; then selected sections for close-ups and inserts (a brief lead-in so the
  performer finds the rhythm); a b-roll pass for hands, details, location. Performers sing at full energy — half-energy
  miming is the amateur tell.
- *Editing to the master* [craft] same sources + https://tryuncle.com/learn/davinci-resolve/davinci-resolve-music-video-editing-and-color-workflow.md:
  the master track goes on the timeline first and **never moves**; every take is aligned to it by waveform, its own
  audio muted; cut on structure, vocal phrasing and energy, **not every beat**; hold longer in verses, cut faster into
  the chorus, create contrast at the bridge (slower cutting or a changed visual approach), save the strongest angle for
  the final chorus; don't cut every repetition to the same durations. One practitioner framework: intro 1 cut per 4-8
  bars, verse 1 per 2-4, pre-chorus 1 per 1-2, chorus 1 per bar or half-bar, bridge 1 per 2-4.
  https://suno.bi/blog/energy-curve-driven-mv-editing-method-sunomv-2026-en ·
  https://jackrighteous.com/en-gb/blogs/music-creation-process-guide/capcut-full-music-video-guide
- *Film-studies frame* [craft] Goodwin: the picture **amplifies**, **illustrates** or **disjoins** from the lyric —
  choose per section, never illustrate every line; Vernallis: music-video editing answers rhythmic, timbral, melodic
  and formal features of the music, not continuity alone; graphic matches are native to the form; the artist is both
  narrator and character. https://repository.uwl.ac.uk/4706/1/EditingDossiermsmi.2017.6.pdf ·
  https://journals.library.columbia.edu/index.php/currentmusicology/article/download/5328/2557/9336

### 1.8 Making a Singer visibly the actual singer

Three mechanisms exist; they stack.

1. **The song is the master; the picture is made to it.** Human practice: playback on set, performer mimes to the
   master, editor aligns to the master and never moves it. AI equivalent: H3 `<Audio 1>` = the authoritative song
   section (≤15 s), retention `fully_copy`, `<Subject 1> (S1)` physically singing, lyrics verbatim in `<d>[...]</d>`;
   or an audio-driven performer model (Wan2.2-S2V, InfiniteTalk) that **generates the body and mouth from the audio**
   (length follows the audio; Apache-2.0; local). [official/oss] above.
2. **Lip windows are a direction decision, not a default.** Ask per line: does seeing the mouth add meaning; is this a
   recognition moment; will the shot hold long enough to read; would a story image say it better. [craft] jackrighteous
   (above). This is also the engineering answer to F7: fewer, longer, frontal sung lines; profile or back-to-camera for
   lines that are not performed.
3. **The singing voice must be the character's.** ACE-Step's timbre reference moved pitch but not identity (ECAPA 0.39);
   SoulX-Singer SVC reached 0.67 from a speech reference but is not approved (provenance). Until a singing identity
   path is accepted by ear, the visible performer is made the singer by **performance correspondence** (mechanisms 1
   and 2), and the voice identity question stays WAITING. No source found claims singing-identity transfer from a
   speech reference as a solved, licensed capability.

Lip-sync repair after the fact (LatentSync, MuseTalk, VideoReTalking) is speech-trained; singing has sustained vowels
and wider shapes; treat repair as a last resort and test on sung material. [oss] https://sync.so/blog/what-is-latentsync

### 1.9 Editorial continuity, persistent assets, reusable performers

- Assemble **only approved takes**, check cuts in sequence, replace weak shots before finalising; stress-test the risky
  shot types (close-ups, full-body action, two-person interaction, lighting change, high emotion) before scaling up.
  [vendor] CapCut (above).
- Persistent performers = the identity pack + state sheets + voice identity + the **log of accepted appearances**
  (GroundShot's memory). Reuse across productions means the pack travels and the appearance lock (CHARACTER-CONTINUITY.md)
  is per pack revision, not per field.
- Graphic match and motif return are legitimate music-video joins (Vernallis) — the continuity QA for a music video
  is different from a scene's (no 180° line between performance and story worlds; a hard cut between worlds is the
  form).

---

## Part 2 — System design extract for Vewbox

Principles (from Part 0 and Part 1): **pictures carry state, words carry action**; **the actual output of step N is
the input of step N+1**; **one authority per layer** (image for look, recording for voice, master for song, accepted
take for continuity); **first-attempt, inspect, root-cause** stays.

### 2.1 Eight systems, one each

```
IDENTITY ──► image path (canonical) ──► image-edit path (states, views, frames, inserts)
VOICE    ──► lines (authoritative recordings) ─┐
MUSIC    ──► song master (sections, line times) ┼──► VIDEO path (H3: I2VA | R2V | FL2VA; audio fully_copy)
CONTINUITY STATE (planned → ACTUAL ledger) ─────┘        │
JOBS (queue, lanes, lease, idempotency, evidence) ◄──────┘ every arrow is a job with an input snapshot
```

#### A. One character identity system (`identity pack v3`)

| Element | Rule |
| --- | --- |
| Canonical image | One front full-body, neutral pose/expression, no temporary condition. The authority; metadata describes it. (Keep.) |
| Identity block | A fixed wording block derived from the image, ≤ 6 features that image models render stably (hair shape/colour, build, skin, glasses/jewellery, wardrobe signature, age read). No expression words, no side-specific details (mirrored 4/4), no scars/moles unless visible and healed in the image (F4). Used verbatim in every prompt as the `<Subject N>` definition; never paraphrased by the planner. |
| Face reference | Derived face crop (CONTINUITY-GAPS gap 8), cited inside the Subject definition, never as a `<Picture>`. |
| Views (optional, derived) | 3/4 and profile views drawn **by the edit path from the canonical image** (2511 viewpoint generation), approved once; used only when a shot's angle needs them. Replaces `CHARACTER_REFS` "expressions, outfits on request". |
| **State sheets** | A look-in-state picture per wardrobe/condition the production needs (dry / soaked; coat / no coat; wound day 3), drawn once from the canonical image by the edit path, approved, named (`soaked-suit`). Shots reference the state sheet, not condition prose (F3). The wardrobe breakdown chart, as pictures. |
| Appearance lock | Per pack revision once any take contains the character (keep CHARACTER-CONTINUITY.md). State sheets may be added after lock; the canonical may not change. |
| Accepted-appearance log | Every accepted take's best identity frame per character is logged (GroundShot memory), reliability-checked (SFace ≥ PASS, frontal), and becomes a *candidate* reference for later shots in the same production. Never replaces the canonical. |

#### B. One voice identity system

Keep the current contract (one identity, profiles per language, PRIMARY/REVIEW, revision, reference hash; a used
character keeps its voice). Add: a **line is final when recorded** — the recording's duration and its forced-alignment
word times are the shot's clock; the video is asked to *carry* it (`<Audio N>` `fully_copy`, window stated), never to
*say* it. Singing identity stays a separate, gated profile (`SINGING`), empty until an engine passes by ear.

#### C. One image path (text → image)

Qwen-Image-2512 only, for two things: the canonical image and a location's master plate. Nothing else is drawn from
text. (Inserts drawn "from words" in 1.6 were a workaround for the edit model keeping a portrait; with state sheets and
hand/sleeve crops they go back to the edit path.)

#### D. One image-edit path (images + instruction → image)

Qwen-Image-Edit-2511 for everything derived: views, state sheets, hero-prop crops, **opening frames**, inserts, the
expression/condition pass. Rules proven here and in the sources: at most two picture inputs per pass; stage people one
at a time (F6); refer to inputs by position ("the woman on the left", "the room in the second image"); name the
person's own hair/facial hair when editing a face (F8); the frame is **checked against the plan before filming**
(framing ladder, people count, face gate, state match) — a failed frame never reaches H3 (F5).

#### E. One video path (local H3, three entries)

| Entry | When | What H3 receives |
| --- | --- | --- |
| **I2VA** (opening frame) | First shot of a scene; any CUT whose frame was drawn from the previous ACTUAL end | `<Picture 1>` at 0.00 s; Subjects cited *inside* definitions (canonical + state sheet) at `fully_preserved`; description = anchors read from the image (not re-staged) → action onset → development → result; camera sentence from the frame's *measured* framing |
| **R2V continuation** | CONTINUOUS boundary, or a CUT the producer wants joined by motion | `<Video 1>` = last 2-3 s of the accepted take (`video continuation`, `partially_preserved`), Subjects as above, location plate as a Subject (`fully_preserved` environment); the prompt's camera must agree with the tail's motion or the chain restarts at a frame (F2 1.3/1.8) |
| **FL2VA** | A shot whose end frame is *also* known (match on action across a planned cut, a return to a motif image) | First and last frames, single shot, motion path described, never two static descriptions |

Always: the recorded line or song section as `<Audio 1>` `fully_copy` with its window; `(S1)` only for a subject who
physically speaks/sings; an off-screen voice marked and lips closed; `overall_soundscape` from the location bed;
`non_diegetic_music` N/A unless scored. Never: positions/facing/background repeated in words when a frame or tail is
bound; a constraint naming someone outside the frame; "locked off" over a moving tail; a boundary the camera cannot do
in one move (refused at plan time).

#### F. One music path

ACE-Step 1.5 XL-SFT → one authoritative recording → stems, section times, per-line times (keep Phase 2's chain). The
recording is the **master**: the music-video timeline is built on it and it never moves; performance shots are cut
in sections of ≤ 15 s (H3's audio cap) on bar boundaries with ≥ 1 bar of overlap so the editor can choose the cut.
Singer identity: `SINGING` profile, WAITING; the song planner keeps assigning lines to Singer characters only.

#### G. One continuity-state system (the ledger)

Replace "planned continuity state on the shot" + "take-end asset" + "continuity log" with one **scene ledger** that has
two columns per shot — PLANNED (from the planner) and ACTUAL (from the accepted take) — and one rule: *the next shot is
built from ACTUAL*.

ACTUAL is extracted from the accepted take, never typed: end-frame image; tail clip (2-3 s); measured framing (face
ladder); who is in frame (people count, identity per person); per-character state tags matched against state sheets
(soaked / dry; thermos in left hand); light read (ΔY/ΔU/ΔV, gap 6); screen direction/line (gap 2); which spoken window
was actually performed. Each ACTUAL entry carries a reliability flag (GroundShot); only PASS entries feed the next
shot's references; REVIEW entries feed it with a warning; a changed accepted take invalidates downstream frames
(`shot-dependencies.ts` already does this — keep it and point it at the ledger).

The ledger *is* the script supervisor's log and the continuity QA reads only it: planned vs actual framing, state,
light, line, people — and the producer sees both columns on the storyboard card.

#### H. One job system

Keep: Postgres queue, lanes, GPU lease, heartbeats/takeover, idempotency keys, evidence files, input snapshot,
AWAITING_REVIEW. Change the *shape*: job kinds become **pipeline stages with a declared input snapshot and a declared
output that another stage consumes** (identity → state sheet → frame → take → ledger entry → next frame …). `PRODUCE`
becomes **"film this scene"**: it walks shots in order, waits for each take's ledger entry (or the producer's choice
between REVIEW takes), and builds the next frame from ACTUAL. Scheduling freedom à la GroundShot (film the shot that
gives the best identity reference first) is optional and only for frames, never for takes in a continuous chain.

### 2.2 Keep / remove / add

**Keep (proven):** command engine and reducers; appearance lock; canonical-image-as-authority; one voice identity with
language profiles; audio-first lines with heard-back checks; ACE-Step master with section/line times; job queue, lease,
recovery, evidence; first-attempt rule; real-UI acceptance; `shot-dependencies` reconciliation; framing ladder, people
count, face gate; take-end DERIVED asset (becomes the ledger's ACTUAL); LocationLight and the blocking line; the
storyboard card's "how this shot joins the previous".

**Remove or retire from the filmmaking core:**

- Prose re-staging in prompts: the planner's start pose / position / facing / background sentences whenever a frame or
  tail is bound (already partially done; make it structural — the prompt composer has no access to those fields in
  I2VA/R2V modes).
- Composing frames from a *crop of the wide plate* (F5): a frame is always an edit of plate + state sheet(s) + previous
  ACTUAL end, staged one person at a time.
- `CHARACTER_REFS` (expressions/outfits on request) and `VOICE_DESIGN` (three candidates: contradicts first-attempt) —
  replaced by state sheets / views in the identity pack and the single designed voice.
- The hosted MiniMax path behind `MINIMAX_API_KEY`, IndexTTS, MiniMax Music 3 and the Ollama/Anthropic/OpenAI story
  routes from ARCHITECTURE.md and code where still present (frozen stack: local only).
- The `IDEA_*` research agents from the film pipeline's critical path (a separate product surface; they do not touch
  continuity).
- Loudness-vs-mouth lip-sync measure as a gate (F7): keep as information; a SyncNet-style offset with its known limits
  replaces it as the machine evidence; the producer's eye decides.
- Scars/moles as default distinguishing details in the designer (F4).

**Add:** state sheets; the two-column ledger; H3 `<Subject N>`/`<Video N>`/`<Audio N>` grammar in the composer with
retention levels; frame-vs-plan preflight as a hard gate; the music-video direction pipeline (2.3); an audio-driven
performer path evaluation (Wan2.2-S2V / InfiniteTalk, Apache-2.0, local) as a LAB comparison against H3 `fully_copy`
for sung sections — nothing promoted before the producer's viewing.

### 2.3 Music-video direction pipeline (specification)

Inputs: an accepted song master (recording, stems, sections with times, lines with times and singer), the Singer
character(s) with identity packs, the production's bible. Every stage is a job with an input snapshot; every stage
ends in the producer's review; nothing downstream starts on an unaccepted stage.

| Stage | Output (data, not prose) | Rules |
| --- | --- | --- |
| 1 Song → meaning | Per section: emotional temperature (1-5), subject, point of view, the one line that matters; a lyric-relationship choice per section — amplify / illustrate / disjoin (Goodwin) | Never illustrate every line; name the song's turn (where it changes) |
| 2 Treatment | Logline; concept in present tense traced through verse → chorus → bridge → final chorus → outro; 4-8 visual references drawn by the image-edit path from the bible (not found images); cinematography block (movement, lens feel, light, aspect); locations & casting; 5-8 beats mapped to sections; the **Out** image | The chorus is designed first; the treatment must fail the "fits any song" test: at least three beats cite a specific lyric or section event |
| 3 Visual concept | Palette, one **motif** (an object, gesture or image that returns on every chorus), world rule (one place, or a location progression with the order fixed) | Motif gets its own picture in the bible; beauty shots outside the world are refused |
| 4 Performer | Singer character; its **performance image**: one state sheet in performance wardrobe, chorus framing (medium or closer), drawn and approved | Identity beats at medium or closer (face-size rule); the performer's mouth is a direction decision per line (the four questions) |
| 5 Location / world | Hero location plate + hero-prop crops + light rule per section (e.g. verse cool/dim, chorus warm/full); progression order if more than one | Each location has a plate before any frame; progression follows the song's turn, not variety for its own sake |
| 6 Storyboard | One frame per shot, drawn from plate + performance image (or story state sheet) + previous ACTUAL end; each frame tagged job = performance / story / atmosphere, section, bars, lyric line(s) if sung | Check against the plan (framing, people, state) before filming; every lyric line has a visual decision (sung on camera / story image / atmosphere) |
| 7 Shot progression | The **coverage matrix** below, filled; shot list with number, section, bars, job, framing, camera, boundary, audio window | Three full-section performance passes for every chorus (wide, medium, close) = the "playback masters"; a static wide of the whole chorus is the safety net |
| 8 Cinematography | Per section: static vs moving, framing ladder position, cut rate target (bars per cut), light rule | Energy mapping: tighter and more moving in high energy, wider and stiller in low; bridge changes at least two of {framing, movement, light, location} |
| 9 Performance (filming) | Takes: H3 with `<Audio 1>` = the section's master slice (≤ 15 s, bar-aligned, ≥ 1 bar overlap), `fully_copy`, `<Subject 1> (S1)` singing the verbatim lyric; or the audio-driven performer path (LAB) | Full energy in the direction words; one take per shot; REVIEW never auto-chosen; the singer's identity measured per take against the pack |
| 10 Editing rhythm | Timeline: master first and immutable; takes aligned by their own windows (not waveform guessing — the slice times are known); cut points on bars/phrases from the alignment; cut-rate per section from stage 8; motif on every chorus; final chorus gets the strongest angle and the largest scale; outro resolves on the Out image | No cut on every beat; repeated sections are not cut identically; graphic matches allowed between worlds; dead air and level rules as in Phase 2 |
| 11 QA + viewing | Machine: every section covered; coverage matrix satisfied; performance shots' identity and offset; no lyric line without a decision. Human: the producer watches the whole video with the song | Acceptance is the viewing |

**Coverage matrix (intentional variation; minimums for a 3-4 minute song, scaled by length):**

| Kind | Minimum | Where |
| --- | --- | --- |
| Establishing | 1 per location | intro, each location change |
| Performance master (wide, static) | every chorus, full section | chorus |
| Performance medium | every chorus; verses optional | chorus, pre-chorus |
| Performance close-up (sung line visible) | ≥ 1 per chorus; the song's one line that matters | chorus, bridge end |
| Story mediums | ≥ 2 per verse | verses |
| Story wides | ≥ 1 per verse | verse openings |
| Reactions | ≥ 1 per verse (a face that is not singing) | verses, bridge |
| Moving camera | ≥ 1 per section with energy ≥ 3; none required in the bridge | build, chorus |
| Motif | on every chorus, varied framing each time | chorus; outro |
| Location progression | order fixed in stage 5; a change only on a section boundary | verse 2, bridge, final chorus |
| Chorus lift | final chorus adds scale: wider master, more movement, or more people/light than chorus 1 | final chorus |
| Bridge change | ≥ 2 of {framing, movement, light, location} differ from the chorus; performance reduced or absent | bridge |
| Resolution | the Out image; no new information after it | outro |

### 2.4 Validation order (unchanged, now with the ledger)

Character visual identity → voice identity → multilingual same person → singing identity → locations → world/story →
storyboard (frames checked against plan) → one shot (I2VA) → two-shot continuity (one CUT built from ACTUAL, one
CONTINUOUS from the tail) → small scene (6-8 shots, two people, one prop, dialogue) → short → music video (stages 1-11)
→ show/season/episode (the ledger's last state becomes the next episode's first).

---

## Part 3 — Source list

Official model documentation
- MiniMax H3 reference prompt guide — https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md
- MiniMax H3 base prompt guide — https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
- MiniMax H3 in ComfyUI (modes, limits) — https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3/workflow
- Qwen-Image-Edit-2511 model card — https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- Qwen-Image-Edit-2511 in ComfyUI — https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- Wan2.2-S2V-14B — https://huggingface.co/Wan-AI/Wan2.2-S2V-14B
- Runway Gen-4 References guide — https://help.runwayml.com/hc/en-us/articles/40042718905875-Gen-4-Image-References-Guide

Papers
- GroundShot (2026) — https://arxiv.org/abs/2606.20799
- VideoMemory (2026) — https://arxiv.org/abs/2601.03655
- StoryBlender (2026) — https://arxiv.org/abs/2604.03315
- UniRef-Image-Edit (2026) — https://arxiv.org/abs/2602.14186
- HoloCine (2025) — https://arxiv.org/abs/2510.20822 · https://github.com/yihao-meng/HoloCine
- Captain Cinema (ICLR 2026) — https://arxiv.org/abs/2507.18634
- Long Context Tuning (ICCV 2025) — https://arxiv.org/abs/2503.10589
- ShotAdapter (CVPR 2025) — https://arxiv.org/abs/2505.07652
- MovieAgent — https://arxiv.org/abs/2503.07314 · StoryAgent — https://arxiv.org/abs/2411.04925 · AniME — https://arxiv.org/abs/2508.18781
- Wan-S2V — https://arxiv.org/abs/2508.18621 · StableAvatar — https://arxiv.org/html/2508.08248v1 · OmniHuman-1 — https://arxiv.org/abs/2502.01061
- Wav2Lip / LSE-C, LSE-D — https://arxiv.org/pdf/2008.10010 · THEval — https://arxiv.org/pdf/2511.04520

Open-source pipelines
- ArcReel — https://github.com/ArcReel/ArcReel
- InfiniteTalk — https://github.com/MeiGen-AI/InfiniteTalk
- legend.video — https://github.com/gaborcselle/legend.video
- Vivijure (coverage) — https://www.creativeainews.com/blog/vivijure-self-hosted-ai-film-studio/
- comfyui-2d-character-pipeline (Qwen-Image-Edit posing → Wan I2V) — https://github.com/mor-o/comfyui-2d-character-pipeline
- Coherent scenes workflow (Qwen-Image-Edit keyframes → Wan 2.2) — https://www.runcomfy.com/comfyui-workflows/create-coherent-scenes-qwen-image-edit-wan-2-2-in-comfyui-cinematic-coherence-workflow

Production practice (human)
- Script supervisor — https://nofilmschool.com/what-does-script-supervisor-do · https://howtofilmschool.com/dictionary/continuity-film/
- Continuity photos, wardrobe breakdown — https://howtofilmschool.com/dictionary/polaroid-continuity-photo/ · https://frankbeddor.com/whos-in-charge-of-the-chaos-of-wicked-the-movie/
- Visual bible / lookbook — https://www.thewrap.com/dune-production-design-visual-bible · https://www.studiobinder.com/blog/film-lookbook/
- Music video treatment — https://pixo.video/blog/music-video-treatment · https://blog.celtx.com/?p=15897 · https://resolvemediagroup.com/news/p/music-video-treatments-what-why-and-how/
- Music video storyboard and shot list — https://171entertainment.com/guides/music-video-storyboard-guide/ · https://storyflow.so/blog/how-to-plan-a-music-video
- Playback and sync on set — https://filmtvsound.com/index.php/audio-techniques/198-shooting-to-sync-playback · https://www.dvxuser.com/threads/how-to-shoot-and-sync-a-music-video.97535/post-97535
- Editing to the master — https://agent.vizard.ai/how-to/cut-a-music-video-from-your-performance-takes.html · https://tryuncle.com/learn/davinci-resolve/davinci-resolve-music-video-editing-and-color-workflow.md
- Cut rate by section — https://suno.bi/blog/energy-curve-driven-mv-editing-method-sunomv-2026-en · https://jackrighteous.com/en-gb/blogs/music-creation-process-guide/capcut-full-music-video-guide
- Performance / story / atmosphere — https://jackrighteous.com/blogs/ai-art-visuals-creatives/atlabs-performance-vs-story-scenes-ai-music-video
- Music-video theory (Vernallis, Goodwin) — https://repository.uwl.ac.uk/4706/1/EditingDossiermsmi.2017.6.pdf · https://journals.library.columbia.edu/index.php/currentmusicology/article/download/5328/2557/9336

AI-tool guidance (patterns only; vendor claims unverified)
- H3 prompting — https://www.kapwing.com/resources/how-to-prompt-minimax-h3-hailuo-3-0-a-guide-for-ai-video-creators/ · https://hackernoon.com/minimax-h3-prompt-guide-how-to-write-better-hailuo-30-video-prompts
- Character bible / layers / series bible — https://www.capcut.com/create/ai-character-consistency-long-form-video-early-2026 · https://invideo.io/faq/how-do-you-create-a-character-bible-for-ai-video-to-lock/ · https://invideo.io/faq/what-is-a-directors-bible-for-ai-filmmaking-and-how-do/ · https://invideo.io/faq/how-do-you-create-an-ai-video-series-with-consistent/
- Reference-to-video chaining vs last frame — https://invideo.io/faq/what-is-reference-to-video-chaining-in-ai-filmmaking-and/ · https://hackernoon.com/how-to-chain-ai-video-clips-into-one-shot-without-the-hidden-stutter-at-every-cut · https://hackernoon.com/how-to-extend-an-ai-generated-video-clip-past-its-length-limit-without-the-drift
- Audio-first dialogue — https://invideo.io/faq/what-is-the-pre-record-then-generate-workflow-for-ai/ · https://hackernoon.com/an-audio-first-workflow-for-ai-video-dialogue-shots · https://www.atlascloud.ai/blog/guides/audio-first-ai-video-workflow · https://higgsfield.ai/blog/make-ai-lipsync-videos
- Kling Elements (typed references) — https://www.atlascloud.ai/blog/guides/how-to-use-kling-3.0-for-character-consistency
- Lip-sync repair tools — https://sync.so/blog/what-is-latentsync

Not found: an independent 2026 making-of from an AI studio (Asteria, Staircase, Promise, Secret Level) describing its
bible or continuity system with measured results; a licensed, released singing-identity transfer from a speech
reference; an official Qwen-Image-Edit-2511 statement of the reference-image limit.
