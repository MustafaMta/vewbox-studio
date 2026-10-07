# Vewbox master production plan

The producer's directives, **verbatim**, assembled from the engineering session (2026-10-06 … 2026-10-07). They are
authoritative in this order: a later directive refines an earlier one where they differ (newest first below). Progress
against them is recorded in `docs/PRODUCTION-EXECUTION-STATUS.md`. Decisions taken in conversation that are not in
these texts are recorded there too (for example: Habibi-TTS **Specialized IRQ** is the Iraqi engine, licence
Apache-2.0 for that checkpoint; lab material without speaker permission is labelled LAB TEST and never promoted).

Secrets: these texts name the Hugging Face credential only as `HF_TOKEN`; no value appears here or anywhere in git.

---

## Part A — Autonomous completion directive (2026-10-07, latest)

VEWBOX STUDIO — AUTONOMOUS COMPLETION DIRECTIVE
Continue all remaining phases without waiting for user interaction
You are now authorized to continue the Vewbox implementation autonomously through the complete master production plan.
I will not be available to answer routine questions.
Do not stop after each phase.
Do not ask me what to do next.
Do not pause for ordinary engineering decisions.
Do not create another planning cycle.
Do not restart completed work.
Continue from the exact current repository/database/model state.
Canonical source:
`D:\vewbox`
Canonical models:
`D:\models`
Persistent data:
`D:\vewbox-data`
Follow:
`docs/MASTER-PRODUCTION-PLAN.md`
Maintain concise progress in:
`docs/PRODUCTION-EXECUTION-STATUS.md`
The master plan remains authoritative.
This directive adds one requirement:
continue executing it autonomously until every technically achievable phase is complete.
1. AUTONOMOUS EXECUTION POLICY
For normal implementation decisions:
decide professionally
→ implement
→ test
→ inspect real output
→ diagnose defects
→ fix root cause
→ commit
→ push
→ continue.
Do not ask me about:

* implementation details;
* filenames;
* schema details;
* component structure;
* API design;
* Docker configuration;
* model mounting;
* worker configuration;
* normal UI details;
* test design;
* ordinary bug fixes;
* normal model integration decisions already established by the master plan.

Use professional engineering judgment.
If one task is blocked, continue every other useful task in the SAME phase that does not depend on the blocker.
If an entire phase has a genuine external blocker, document it clearly and continue preparatory/non-destructive work for later phases where doing so does not violate dependencies.
Never fabricate success.
Never mark a phase passed without its real acceptance evidence.
2. EXTERNAL-BLOCKER RULE
Only stop a specific action for issues such as:

* speaker consent;
* account login;
* unavailable private credential;
* licence acceptance requiring the user;
* hardware/OS confirmation impossible to automate;
* human listening/visual acceptance explicitly required.

For these cases:

1. preserve the exact blocker;
2. mark the gate `WAITING_FOR_USER`;
3. do not fake or bypass the requirement;
4. continue all independent engineering work;
5. move forward only where doing so cannot invalidate the blocked gate.

Example:
Phase 3 production Iraqi speaker consent may remain pending.
That must NOT prevent:

* Habibi IRQ lab validation;
* phoneme QA;
* Qwen3-ASR integration;
* Arabic alignment;
* Iraqi song-planner implementation;
* Singer identity engineering;
* SFX integration;
* stem separation;
* reliability work;
* UI preparation.

But do not promote an unconsented voice as production.
3. FIRST-ATTEMPT RULE REMAINS MANDATORY
One creative request
→ one intended creative output.
No:

* best-of-N;
* hidden candidate batches;
* multiple songs followed by selection;
* multiple videos followed by selection;
* repeated image generation until one passes;
* silent creative retry loops;
* duplicate jobs;
* fake first-attempt metrics.

Track:
`creative_attempt_number`
separately from:
`infrastructure_retry_count`
Infrastructure resume/retry is allowed.
Creative retries must remain explicit and only occur after:
preserve failure
→ diagnose root cause
→ fix root cause
→ regenerate affected asset.
Never hide first-attempt failure.
4. FROZEN PRODUCTION MODEL STACK
Do not reopen broad model research.
Use the established production stack.
Main studio brain
Inferact/Qwen3.8-27B-NVFP4
Parameters:
27B
Approximate local checkpoint size:
~26.4 GB
Production role:

* story;
* screenplay;
* agents;
* planning;
* World Bible;
* Location Bible;
* character reasoning;
* continuity;
* episodes;
* scenes;
* shots;
* song concepts;
* lyrics;
* structured production state.

Single RTX 5090 runtime.
No production fallback to old Qwen/Gemma planners.
Image generation
Qwen-Image-2512
Approximately:
20B-class
Existing production weight footprint is roughly:
~19 GB FP8, plus required encoder/VAE/LoRA assets.
Use for:

* canonical characters;
* Actors;
* Singers;
* locations;
* storyboards;
* opening frames;
* keyframes;
* Cartoon;
* Anime;
* Realistic.

Image editing
Qwen-Image-Edit-2511
Approximately:
20B-class
Existing production footprint roughly:
~19 GB mixed/FP8, plus required adapters.
Use for:

* identity-preserving edits;
* expressions;
* wardrobe;
* props;
* recurring environments;
* composition;
* shot references.

Video
MiniMax H3
Parameters:
33B
Existing Vewbox model footprint approximately:
~65 GB for required FL2V/reference assets.
ONLY production video engine.
No Wan.
No LTX.
No alternative production video generator.
English/general character speech
MOSS-TTS Delay-8B v1.5
Parameters:
8B
Existing model footprint roughly:
~24 GB
Use for persistent English/general spoken character identity.
Iraqi/Baghdadi speech
Habibi-TTS Specialized IRQ
Use only:
specialized IRQ checkpoint
NOT Unified.
Use for Iraqi/Baghdadi production speech once proper speaker consent exists.
Until then, official upstream reference material is LAB TEST ONLY.
Do not turn a non-consented reference speaker into a Vewbox production character.
ASR
Qwen3-ASR-1.7B
Parameters:
1.7B
Primary production ASR.
Use for:

* dialogue;
* Arabic;
* English;
* singing;
* songs;
* lyric QA;
* subtitles.

Forced alignment
Qwen3-ForcedAligner-0.6B
Parameters:
0.6B
Use for supported languages including English.
For Arabic/Iraqi:
Qwen3-ASR + WhisperX
Keep WhisperX specifically for Arabic alignment.
Lip-sync
LatentSync 1.6
Specialist.
Use ONLY for:
realistic spoken-dialogue repair
when required.
Do NOT use for:

* Anime;
* Cartoon;
* Singing.

Music generation
ACE-Step 1.5 XL-SFT
Parameters:
4B DiT
Approximate download:
~9.97 GB
Primary authoritative song generator.
Music language/reasoning
ACE-Step 5Hz LM
Parameters:
4B
Approximate download:
~8.38 GB
Use for music reasoning and generation support.
Advanced music editing
ACE-Step 1.5 XL-Base
Parameters:
4B DiT
Approximate download:
~9.97 GB
Only required for advanced operations such as:

* continuation;
* repaint;
* completion;
* cover/edit workflows;
* extraction where applicable.

Do not download it unnecessarily if no active workflow requires it.
Sound effects / Foley
MOSS-SoundEffect v2.0
Parameters:
1.3B DiT
Use instead of old MOSS-SoundEffect 8B.
Use for:

* ambience;
* Foley;
* footsteps;
* traffic;
* crowds;
* doors;
* weather;
* environmental sounds;
* cinematic effects.

Stem separation
HTDemucs-FT
Use:
`htdemucs_ft`
for final-quality production stems.
Identity/vision QA
DINOv2
Keep as supporting identity/drift embedding model.
Keep:
MediaPipe + YuNet
for:

* face detection;
* pose/head angle;
* mouth/hand occlusion;
* lip-sync safety;
* supporting visual QA.

Final restoration
SeedVR2
Optional final approved-video restoration.
Do not automatically apply it to everything.
Keep:
Real-ESRGAN
as lightweight image/upscale fallback.
5. MODEL DOWNLOAD POLICY
Continue missing downloads autonomously.
Do not wait for me.
All model files:
`D:\models`
Never download production weights to C:.
Only one major download at a time while bandwidth remains constrained.
Use:

* resumable download;
* pinned revision;
* manifest;
* published SHA-256 where available;
* local SHA-256 otherwise;
* byte-count verification.

Never redownload a complete verified model.
Current/remaining production queue should be reconciled against disk before each download.
Priority:

1. current active download finishes;
2. MOSS-SoundEffect v2.0 if incomplete;
3. HTDemucs-FT if incomplete;
4. required Apache-2.0 phoneme model (~1.26 GB) for Iraqi phoneme QA;
5. any missing Qwen3-ASR / aligner assets;
6. any missing ACE-Step production weights;
7. SeedVR2 only when final restoration work begins.

Before downloading:
check whether exact checkpoint already exists.
If complete:
skip.
Do not accumulate duplicate checkpoints.
6. CLEAN MODEL STORE
Previously retired production models must stay retired.
Do not recreate or redownload:

* Qwen3.6 planner;
* old Qwen3 planner;
* old Gemma planner;
* Qwen3.8 FP8;
* FLUX.2 klein;
* MiniMax Music 3.

Their removal is intentional.
Do not recreate their registry entries or fallback routes.
For unrelated evaluation weights such as JoyAI/Qwen-Image 2.1/Qwen3-VL/Wan VAE:
do not let cleanup distract from production work.
When convenient, perform dependency checks.
If definitely unused and superseded:
remove them cleanly and record reclaimed disk space.
Do not delete anything still referenced.
7. PHASE 0 — COMPLETE
Treat Phase 0 as complete if current production status confirms:
Qwen3.8-27B-NVFP4 is the active working Vewbox planner.
Do not reopen Phase 0 unnecessarily.
8. PHASE 1 — COMPLETE/ACCEPTANCE STATE
Respect the existing Phase 1 implementation and artifacts.
Do not regenerate accepted work merely to make new examples.
Any remaining human listening requirement should stay recorded honestly.
Do not restart the phase unless a real defect requires it.
9. PHASE 2 — COMPLETE / PROMOTED
Phase 2 is promoted.
Canonical first-attempt song:
Harbour Lights
Do not regenerate it.
Preserve:

* raw recording;
* normalized recording;
* seed;
* creative attempt = 1;
* concept;
* lyrics;
* assignments;
* stems;
* QA;
* honest 23/24 alignment result;
* user listening acceptance.

ACE-Step is the production music engine.
Do not bring MiniMax Music back.
10. PHASE 3 — IRAQI SPEECH + IRAQI SONG
Continue Phase 3 autonomously.
Lab validation
Official Habibi IRQ demo/reference may be used ONLY as:
LAB TEST — NOT PRODUCTION / NO SPEAKER PERMISSION
Use it for:

* inference;
* phoneme checks;
* ASR;
* Whisper comparison;
* alignment;
* pipeline QA.

Do not:

* create permanent production identity from the demo speaker;
* promote it;
* claim speaker consent;
* use it commercially.

Iraqi production voice gate
Production voice ultimately requires:
a real consented Baghdadi speaker reference.
Until such a reference exists:
mark only that production identity gate as:
`WAITING_FOR_USER`
Continue every other Phase 3 engineering task.
Phoneme QA
Keep permanent regression coverage for Iraqi:

* چ /tʃ/
* گ /g/
* appropriate Iraqi realizations
* Iraqi vocabulary
* colloquial phrasing.

Do not change spelling to make the synthesizer pass.
Iraqi dialect planner
Qwen3.8 must produce genuinely Iraqi/Baghdadi text when requested.
Do not use a simplistic hard blacklist where one formal word invalidates an otherwise natural line.
Use contextual dialect evaluation:

* grammar;
* Iraqi vocabulary;
* pronouns;
* negation;
* questions;
* contractions;
* register;
* overall naturalness.

Machine check = supporting signal.
Human Iraqi listening = final acceptance.
Iraqi song
Build everything necessary now.
Do not generate/promote the final production Iraqi song until Singer identity mechanism is valid.
11. SINGER IDENTITY
This is important.
A persistent Singer cannot mean:
character X selected
→ ACE-Step invents unrelated vocalist Y.
Use explicit performer identity.
First test ACE-Step's existing `reference_audio` conditioning with the approved/available reference where legally appropriate.
Measure/inspect whether it actually preserves:

* vocal timbre;
* perceived speaker identity;
* vocal age/presentation;
* character consistency.

Do NOT claim “voice cloning” unless actual results demonstrate it.
If ACE-Step reference conditioning does not preserve identity:
preserve the failed test;
document it;
research only the minimal production-safe solution needed for persistent singing identity.
Any added solution must pass:

* commercial licence review;
* provenance review;
* local execution;
* 5090 compatibility;
* singing quality;
* same-reference identity capability.

Do not silently accept a random singer.
12. PHASE 4 — MUSIC VIDEO
Once the required Phase 3 production gates are truly available, complete Music Video.
Pipeline:
Qwen3.8
→ concept
→ treatment
→ performer assignment
→ live storyboard
→ shot plan
ACE-Step
→ ONE authoritative song
HTDemucs-FT
→ stems where useful
Qwen3-ASR + alignment
→ vocal timing
Qwen-Image-2512
→ characters/locations/keyframes
Qwen-Image-Edit-2511
→ identity/environment consistency
MiniMax H3
→ performances
FFmpeg/Vewbox editor
→ song-locked final film.
Requirements:

* actual assigned singer;
* no random background singer;
* no second soundtrack;
* no song regeneration per shot;
* no LatentSync for singing;
* reaction shots;
* performance shots;
* wide/medium/close coverage;
* cinematography;
* movement;
* lighting;
* coherent concept/story;
* professional editing rhythm.

Generate ONE intended Music Video.
Inspect entire result.
13. PHASE 5 — SHOWS / SEASONS / EPISODES
Complete the long-form architecture.
Hierarchy:
Show
→ Season
→ Episode
→ Scene
→ Shot
→ Asset/Take.
Persist:

* World Bible;
* cast;
* voices;
* relationships;
* recurring locations;
* timeline;
* unresolved events;
* character knowledge;
* world rules;
* visual direction;
* language;
* music identity.

Episode N+1 must inherit Episode N state.
Test progressively:
2–3 shots
→ 4–8 shots
→ multi-scene sequence
→ complete episode
→ approximately 5–10 minute episode.
Do not produce silent montages and call them episodes.
Include:

* acting;
* dialogue;
* ambience;
* Foley;
* music where justified;
* reactions;
* cinematic cuts;
* recurring locations;
* persistent identities;
* story progression.

14. PHASE 6 — SHORTS
Build fully finished Shorts.
Support:

* Cartoon;
* Anime;
* Realistic.

A Short still requires:

* story;
* persistent character;
* location;
* performance;
* voice/audio;
* sound design;
* storyboard;
* shots;
* editing;
* export.

Do not lower continuity standards because duration is shorter.
15. PHASE 7 — COMPLETE STUDIO HARDENING
After feature phases are functional:
run complete studio reliability testing.
Validate:

* Actor;
* Singer;
* Actor + Singer;
* English dialogue;
* Iraqi dialogue where production reference exists;
* English song;
* Iraqi song where approved;
* Music Video;
* Shorts;
* Shows;
* Seasons;
* multiple Episodes;
* recurring cast;
* recurring locations;
* persistent voices;
* world continuity;
* story continuity.

Test restart recovery.
Intentionally stop/restart a worker during one safe production test.
Ensure:
completed dependencies remain completed;
active task resumes safely;
no duplicate creative job appears.
16. LIVE STORYBOARD
Do not neglect the storyboard while building backend functionality.
Every meaningful shot should expose:

* opening image/keyframe;
* character;
* location;
* camera;
* framing;
* action;
* dialogue;
* performer;
* voice;
* music cue;
* ambience;
* SFX/Foley;
* duration;
* boundary;
* continuity state;
* status.

Allow preview audio where practical.
Storyboard should feel like professional pre-production, not a table of prompts.
17. MAKE FILMS FEEL ALIVE
Vewbox output must not feel like:
image
→ slow zoom
→ silence
→ next image.
Every scene should have intentional combinations of:

* acting;
* expressions;
* eye focus;
* body language;
* breathing/natural movement;
* environmental movement;
* reactions;
* dialogue;
* room tone;
* ambience;
* Foley;
* music;
* camera direction;
* foreground/background activity;
* dramatic timing.

Intentional silence is valid.
Accidental dead silence is not.
18. CONTINUITY IS A SYSTEM, NOT A PROMPT
Persist:
CHARACTER STATE
LOCATION STATE
STORY STATE
SHOT STATE.
Every boundary must be classified:
CONTINUOUS
CUT
TRANSITION
Do not hide continuity defects with:

* fades;
* black frames;
* dissolves;
* random transitions.

19. STYLE QUALITY
Cartoon
Aim for feature-animation production discipline:

* expressive poses;
* readable silhouettes;
* cinematic lighting;
* stable characters;
* intentional camera;
* strong staging;
* environmental storytelling;
* polished sound.

Do not imitate specific copyrighted characters or films.
Anime
Maintain:

* line consistency;
* face;
* eyes;
* hair;
* body proportions;
* wardrobe;
* palette;
* key poses;
* anime-specific acting;
* compositing;
* cinematic lighting.

No realistic mouth replacement.
Realistic
Check:

* face;
* eyes;
* teeth;
* hands;
* skin;
* hair;
* wardrobe;
* object interaction;
* lighting;
* physical continuity.

20. RELIABILITY ARCHITECTURE
Every production job must carry:

* stable UUID;
* dependencies;
* progress;
* deterministic input snapshot;
* exact checkpoint/revision provenance;
* character refs;
* location refs;
* audio refs;
* cancellation;
* timeout;
* restart recovery;
* safe resume;
* failure classification.

If Shot 12 fails:
do not rerun Shots 1–11.
21. ONE RTX 5090 RESOURCE POLICY
Hardware:
single RTX 5090, 32 GB VRAM.
Do not let major inference services fight for VRAM.
Normally run one major GPU inference workload at a time.
Unload inactive large models.
Production generation has priority over benchmarks.
Do not keep giant models resident just for convenience.
22. REAL MEDIA ACCEPTANCE
Unit tests are required but insufficient.
HTTP 200 is insufficient.
Job completed is insufficient.
Model loaded is insufficient.
You must inspect real media.
WATCH VIDEO.
LISTEN TO AUDIO.
Check:

* identity;
* acting;
* voice;
* singer;
* pronunciation;
* continuity;
* location;
* camera;
* motion;
* sound;
* music;
* silence;
* duplication;
* clipping;
* black frames;
* frozen frames;
* A/V sync.

Never promote a phase solely from machine metrics.
If human acceptance is explicitly required and user is unavailable:
mark:
`WAITING_FOR_USER_ACCEPTANCE`
and continue other non-dependent engineering.
23. ROOT-CAUSE RULE
Never hide a defect.
Failure:
preserve
→ identify exact stage
→ diagnose
→ fix root cause
→ rerun affected dependency
→ verify.
Do not use later-stage hacks to compensate for broken earlier stages.
24. UI PRODUCT STANDARD
Vewbox must feel like a premium filmmaking studio.
Primary areas:

* Home
* Shows
* Shorts
* Music Videos
* Characters
* Locations
* Studio Company
* Production
* Screening Room
* Editing / Final Cut
* Exports

Do not turn creative pages into infrastructure dashboards.
Character UI = casting.
Storyboard = pre-production.
Production = filmmaking.
Screening Room = review.
Final Cut = finishing.
25. AUTO AND MANUAL MODE
AUTO:
execute the complete professional pipeline using persistent structured state.
MANUAL:
allow control of:

* story;
* cast;
* location;
* shots;
* voice;
* music;
* performance;
* editing.

Auto does NOT mean random generation.
Both modes use identical identity and continuity contracts.
26. COMMITS / GIT
Keep main clean.
Commit cohesive completed changes.
Push completed checkpoints.
Do not create many abandoned worktrees/branches.
Do not run concurrent agents that modify the same checkout/database.
One active Vewbox engineering authority only.
Before destructive operations:
verify dependencies.
Do not delete archives/backups.
27. FINAL COMPLETION DEFINITION
Vewbox is complete when a user can:
create a character
→ Actor / Singer / Actor+Singer
→ establish persistent identity
→ establish persistent voice
→ create/reuse locations
→ create stories
→ create songs
→ assign actual Singer
→ create Music Video
→ create Short
→ create Show
→ create Season
→ create Episodes
→ preserve world/story/identity over time
→ edit
→ screen/review
→ export
and the resulting output remains:
coherent
alive
cinematic
consistent
continuous
stable
recoverable
reliable
28. START / CONTINUE NOW
Do not start over.
Continue from the current Phase 3 state.
Keep current valid background downloads running/resumable.
Finish every possible Phase 3 engineering item.
Where speaker consent blocks production acceptance, record the blocker and continue independent work.
Then continue through Phases 4, 5, 6 and 7 according to dependency safety.
Do not wait for routine user responses.
Do not ask ordinary questions.
Do not redesign the model stack.
Do not bring retired models back.
Do not use hidden creative retries.
Do not fake acceptance gates.
Keep working until every technically achievable part of Vewbox is implemented, tested, integrated, committed and pushed.
The goal remains:
a complete professional AI filmmaking studio, not just an AI video generator.
START CONTINUING THE CURRENT WORK NOW.

---

## Part B — Phase 3 corrections (2026-10-07)

Continue Phase 3, but apply these corrections before generating the Iraqi voice or Iraqi song.
1. DO NOT ASSUME CROSS-ENGINE VOICE IDENTITY
The statement:
“Habibi speaks Iraqi and MOSS speaks English from the same reference, therefore it is the same voice”
is not sufficient.
Using the same consented reference does not guarantee that two different synthesis engines preserve the same perceived speaker identity.
The persistent-character contract remains:
ONE character
→ ONE consented performer identity
→ speech in different languages must still sound recognizably like that same performer.
For the Iraqi Actor + Singer:
Iraqi/Baghdadi:
Habibi-TTS Specialized IRQ
English/general speech:
MOSS-TTS v1.5
Both may use the same consented reference, but before declaring identity continuity, compare the generated outputs.
Evaluate:

* speaker similarity embedding where appropriate;
* pitch range;
* timbre;
* vocal age/presentation;
* formant/tone characteristics where useful;
* human listening.

Machine similarity is supporting evidence only.
If Habibi Arabic and MOSS English sound like materially different people:
FAIL cross-language identity.
Do not hide the mismatch.
Preserve samples and report it before promoting the character as bilingual.
2. IRAQI LANGUAGE VALIDATION MUST NOT BE A SIMPLE WORD BLACKLIST
Do not implement Iraqi dialect quality as:
word appears in MSA list
→ automatically reject entire song.
Words such as formal Arabic vocabulary may legitimately appear depending on context, character, poetic register or song style.
For a requested natural Baghdadi production, instead evaluate the complete text for:

* Iraqi vocabulary;
* Iraqi grammar;
* natural Baghdadi constructions;
* pronouns;
* negation;
* question forms;
* contractions;
* phonologically relevant spelling;
* context;
* overall register.

Terms strongly associated with MSA should produce:
dialect-drift warning / rewrite suggestion
rather than an unconditional failure solely because one word appears.
A plan should fail only when the overall requested dialect clearly drifts away from Iraqi/Baghdadi or violates an explicit strict-colloquial requirement.
Qwen3.8 should perform the contextual rewrite.
Human Iraqi listening remains authoritative.
Do not optimize lyrics merely to satisfy a lexical checker.
3. KEEP THE چ / گ PHONEME REGRESSION GATE
Keep the phoneme-level check.
The historical failure of words such as:
`باچر`
must remain an explicit regression test.
Where the text requires /tʃ/, an output that substitutes another consonant fails.
Likewise test /g/ in appropriate Iraqi words.
Do not change Iraqi spelling to make a weak engine pass.
4. IRAQI REFERENCE
Wait for the real consented recording before creating the performer.
The reference must be:

* one speaker;
* natural Baghdadi speech;
* approximately 5–12 seconds;
* clean;
* no music;
* low noise;
* normal speaking style;
* explicitly consented for voice cloning.

After it arrives:
analyze it
→ confirm single speaker
→ determine speaker presentation
→ measure duration/noise/loudness/pitch
→ create the matching realistic Baghdadi Actor + Singer
→ user uploads it through the real Voice UI and records consent
→ establish the persistent Habibi IRQ voice.
Do not generate a temporary synthetic performer while waiting.
5. IRAQI SPEECH ACCEPTANCE
Generate separate intentional test lines covering:

* everyday Baghdadi conversation;
* short dialogue;
* longer dialogue;
* emotion;
* Iraqi names;
* colloquial phrasing;
* چ;
* گ;
* appropriate Iraqi ق realization.

Each test request creates ONE output.
No hidden best-of-N.
QA:
Habibi IRQ
→ Qwen3-ASR
→ dialect Whisper comparison
→ phoneme gate
→ speaker-identity comparison
→ human Iraqi listening.
Do not promote solely from ASR results.
6. SINGER IDENTITY — DO NOT ACCEPT RANDOM ACE-STEP VOCALIST
Once the spoken performer identity passes, solve Singer identity BEFORE creating the Phase 3 Iraqi song.
ACE-Step currently generates its own vocalist.
That is not acceptable when Vewbox explicitly assigns a persistent Singer.
Before adding another production model, test ACE-Step 1.5's existing:
`reference_audio`
capability using the SAME consented character voice reference.
ACE-Step documentation states reference audio can influence global acoustic characteristics including vocal timbre and performance style.
Perform one controlled singing-identity test:
same character reference
→ ACE-Step reference_audio
→ one short intended song/vocal test
→ compare resulting singer identity with the character.
Check:

* perceived identity;
* vocal timbre;
* gender/presentation;
* pitch behavior;
* intelligibility;
* singing quality.

Do not claim this is voice cloning unless the actual result proves identity preservation.
If ACE-Step reference audio produces a convincingly matching singer:
use it as the normal Singer identity mechanism.
If it does NOT preserve the character identity:
preserve the failed sample and report the result.
Then evaluate a dedicated zero-shot singing voice conversion path rather than silently using an unrelated vocalist.
Do not add such a model without first checking:

* current maintenance status;
* commercial licence;
* model licence;
* training/provenance concerns;
* quality on singing;
* ability to use the same consented performer reference.

For example, Seed-VC supports zero-shot singing voice conversion from a short target reference, but its upstream repository is archived and GPL-3.0, so it must NOT be introduced into the Vewbox production stack casually.
No new singing-identity model is production-approved yet.
7. IRAQI SONG
Only after spoken identity AND singing-identity mechanism are proven:
Qwen3.8
→ genuine Iraqi concept
→ Baghdadi lyrics
→ English gloss for UI
→ explicit Singer assignment
ACE-Step
→ authoritative song
→ same performer identity mechanism
→ Qwen3-ASR
→ Arabic alignment
→ human Iraqi listening.
Generate ONE song.
No alternatives.
No candidate batch.
No unrelated singer.
8. DOWNLOADS
Continue:
MOSS-SoundEffect v2.0
→ HTDemucs-FT
→ required phoneme model
in the existing sequential resumable queue.
Do not let these downloads block reference analysis or CPU-only Phase 3 work.
9. CLEANUP
Leave the unrelated old evaluation weights alone for now unless dependency checking proves they are completely obsolete.
Do not let model cleanup distract from Phase 3.
The current objective is:
consented Baghdadi performer
→ authentic Iraqi speech
→ proven cross-language voice identity
→ proven singer identity
→ one Iraqi song.
Continue autonomously within Phase 3.

---

## Part C — Final clean production directive (2026-10-06): the base plan

VEWBOX STUDIO — FINAL CLEAN PRODUCTION DIRECTIVE
CORRECTED MODEL STACK + COMPLETE PROFESSIONAL AI FILMMAKING EXECUTION PLAN
STOP the current fragmented execution and use this document as the single authoritative plan.
Preserve valid completed code and current resumable downloads, but remove stale assumptions and conflicting production routes.
Canonical source:
`D:\vewbox`
Canonical model store:
`D:\models`
Canonical persistent data:
`D:\vewbox-data`
The current database intentionally starts fresh.
Do not restore old productions or media.
1. SECURITY AND DOWNLOAD AUTHENTICATION
A Hugging Face token is available locally for downloading approved models.
Use it only through:
`HF_TOKEN`
or the existing secure local Hugging Face credential store.
Never:

* hard-code the token;
* put it in source;
* put it in `.env.example`;
* commit it;
* print it;
* include it in logs;
* include it in reports;
* include it in generated documentation.

Ensure:
`.env`
and
`.env.local`
remain git-ignored.
Use authenticated Hugging Face downloads to maximize reliable access/resume performance.
Downloads must be resumable.
After setup/downloads are complete, the exposed credential will be rotated externally.
2. ONE PRODUCTION BRAIN — NO OLD QWEN ROUTE
The production brain is:
Inferact/Qwen3.8-27B-NVFP4
27B parameters
This is the ONLY active production planner/brain.
Target:
`D:\models\llm\qwen3.8-27b-nvfp4`
Do not continue using:

* Qwen3.6 as production;
* Qwen3.8 FP8 as production;
* Gemma as production;
* small general planners;
* alternate general LLM fallbacks.

Remove those models from active production routing.
Do not silently fall back to them.
If Qwen3.8 NVFP4 fails, surface the actual failure and fix it.
Do not hide the failure by switching to another planner.
Old checkpoint files may be removed from the active model store once you have verified they are not needed by another service and the NVFP4 deployment is stable.
Do not maintain a multi-planner architecture.
3. QWEN3.8 NVFP4 — RTX 5090 RUNTIME
Hardware:
single RTX 5090, 32 GB VRAM.
Serve:
`Inferact/Qwen3.8-27B-NVFP4`
through vLLM using the single-5090-compatible configuration.
Start conservatively:

* tensor parallel size = 1;
* approximately 32K initial context;
* FP8 KV cache where supported;
* `--enforce-eager`;
* supported Qwen reasoning parser;
* conservative initial concurrency;
* no simultaneous large LLM.

Do not attempt to maximize context/concurrency before basic stability is proven.
Measure:

* load time;
* VRAM;
* RAM;
* first-token latency;
* tokens/sec;
* stable context size;
* JSON/schema reliability.

4. CURRENT VLLM DOWNLOAD
Keep the current resumable vLLM runtime download if it is healthy and transferring.
Do not restart from zero.
Continue validating:

* registry manifest;
* layer hashes;
* resumability;
* final image integrity.

If DNS temporarily fails:
retry token/registry resolution with bounded backoff.
Do not discard already downloaded blobs.
Once complete:
`docker load`
→ verify image
→ start Qwen3.8 NVFP4.
5. FINAL PRODUCTION MODEL STACK
Main brain
Inferact/Qwen3.8-27B-NVFP4
27B
Purpose:

* story;
* screenplay;
* production reasoning;
* agents;
* World Bible;
* Location Bible;
* continuity;
* scenes;
* shots;
* seasons;
* episodes;
* music concepts;
* lyric planning;
* structured production state.

Image generation
Qwen-Image-2512
~20B-class
Production image generator.
Use for:

* canonical characters;
* Actors;
* Singers;
* Cartoon;
* Anime;
* Realistic;
* locations;
* environments;
* posters;
* storyboard frames;
* opening frames;
* keyframes.

Remove obsolete general image routes after the Qwen route is proven.
FLUX must not be the production default.
Image editing / consistency
Qwen-Image-Edit-2511
~20B-class
Use for:

* character identity preservation;
* expressions;
* wardrobe;
* props;
* recurring locations;
* opening frames;
* shot references;
* composition;
* environment consistency.

Video
MiniMax H3
33B
ONLY production video-generation engine.
No:

* Wan;
* LTX;
* alternate video model;
* hosted production video backend.

Persistent spoken voice
MOSS-TTS Delay-8B v1.5
8B
Production spoken voice engine after real validation.
Use for:

* character voice identity;
* short dialogue;
* long dialogue;
* emotional dialogue;
* recurring voices.

Replace IndexTTS after MOSS succeeds in the real character phase.
Production ASR
Qwen3-ASR-1.7B
1.7B
Primary ASR for:

* English;
* Arabic;
* speech;
* dialogue;
* singing;
* songs with music;
* subtitle QA;
* lyric QA.

Do not use Whisper large-v3 as primary production ASR after Qwen3-ASR passes.
Forced alignment
Qwen3-ForcedAligner-0.6B
0.6B
Use for supported languages such as English.
English:
`Qwen3-ASR-1.7B`

* 

`Qwen3-ForcedAligner-0.6B`
For Iraqi Arabic/Arabic:
`Qwen3-ASR-1.7B`

* 

`WhisperX`
because Qwen3 ForcedAligner does not cover Arabic.
Lip-sync correction
LatentSync 1.6
Only for failed realistic spoken dialogue.
Do not use for:

* Cartoon;
* Anime;
* Singing.

Music generation
ACE-Step 1.5 XL-SFT
4B DiT
Final song generation.
ACE-Step 5Hz LM
4B
Music reasoning/composition.
ACE-Step 1.5 XL-Base
4B DiT
Only for advanced operations where needed.
Sound effects
MOSS-SoundEffect v2.0
1.3B DiT
Replace the old MOSS-SoundEffect 8B route.
Use for:

* ambience;
* Foley;
* footsteps;
* traffic;
* crowds;
* weather;
* doors;
* environment;
* cinematic effects.

Stems
HTDemucs-FT
Use `htdemucs_ft` for final production stem separation.
Visual QA
Keep:
DINOv2
MediaPipe
YuNet
for supporting:

* identity similarity;
* face detection;
* head angle;
* hand-mouth occlusion;
* lip-sync safety.

These are QA tools, not creative engines.
Final restoration
SeedVR2
Optional final approved-video restoration.
Do not automatically run it on every generation.
Keep:
Real-ESRGAN
only as lightweight image/upscale fallback.
6. DOWNLOAD POLICY
All weights:
`D:\models`
Never C:.
Only one major download at a time while the connection is constrained.
Use authenticated Hugging Face downloads through the local secret token.
Every model download must be:

* resumable;
* pinned to exact revision;
* verified;
* recorded in manifest;
* SHA-256 checked where upstream hashes exist;
* locally hashed otherwise;
* byte-count verified.

Correct queue:

1. finish vLLM runtime;
2. Qwen3.8-27B-NVFP4;
3. Qwen3-ASR-1.7B;
4. Qwen3-ForcedAligner-0.6B;
5. ACE-Step XL-SFT 4B;
6. ACE-Step 5Hz LM 4B;
7. ACE-Step XL-Base only if required;
8. MOSS-SoundEffect v2.0;
9. HTDemucs-FT;
10. SeedVR2 later.

Skip:

* Qwen-Image-2512;
* Qwen-Image-Edit-2511;
* MiniMax H3;
* MOSS-TTS;
* LatentSync;
* DINOv2;
* MediaPipe/YuNet;

when existing weights are already complete and verified.
7. REMOVE OBSOLETE MODEL ROUTES CLEANLY
Do not merely rename UI labels.
When a production replacement is proven:
remove:

* obsolete provider routing;
* obsolete active model registry entry;
* unused environment variables;
* stale Compose mounts;
* dead model adapters;
* stale feature flags;
* outdated documentation.

Do not delete model data until the new route has passed a real test.
After proof, remove old unused weights cleanly.
The end state must be simple and intentional.
8. VEWBOX IS A FILM STUDIO
Vewbox must function like a complete professional filmmaking organization.
Not a text-to-video page.
Not a model playground.
Not a benchmark UI.
It must provide persistent:

* Actors;
* Singers;
* Characters;
* Voices;
* Worlds;
* Locations;
* Shows;
* Seasons;
* Episodes;
* Shorts;
* Music Videos;
* Songs;
* Storyboards;
* Productions;
* Sound;
* Editing;
* QA.

9. CHARACTER TYPES
Add and enforce:
Actor
Singer
Actor + Singer
Every character gets:

* unique ID;
* one canonical front full-body image;
* persistent spoken voice identity;
* singing identity/reference where applicable;
* Cartoon/Anime/Realistic type;
* language;
* dialect;
* physical description;
* wardrobe;
* personality;
* acting characteristics;
* relationships;
* lock state.

One character does not get a canonical side/back/turnaround library.
Internal shot references may be generated but must derive from the canonical identity.
10. SINGER IDENTITY
Singer identity must be persistent.
Do not claim that an assigned character is singing while ACE-Step actually uses a random unrelated voice.
Maintain:

* performer ID;
* lead/backing/duet role;
* spoken identity;
* singing reference/identity;
* language;
* music style capability.

The same character must remain recognizably the same performer.
11. FIRST-ATTEMPT POLICY
ONE creative request
→ ONE intended result.
No:

* best-of-N;
* candidate batches;
* silent alternative generations;
* automatic creative retry loops;
* multiple songs and choose one;
* multiple images and choose one;
* multiple video takes and choose one.

Infrastructure recovery is allowed.
Track separately:
`creative_attempt_number`
and
`infrastructure_retry_count`.
If actual creative output exists and fails:
preserve
→ diagnose
→ fix
→ explicitly regenerate only affected asset.
12. LIVE STORYBOARD
Storyboard cards must communicate real filmmaking.
Each shot includes where relevant:

* opening frame;
* characters;
* location;
* framing;
* camera;
* action;
* dialogue;
* voice;
* performer;
* music;
* ambience;
* Foley;
* duration;
* boundary;
* continuity;
* production state.

Allow audio preview where useful.
Storyboard must feel alive.
13. CONTINUITY SYSTEM
Do not rely on conversational LLM memory.
Persist structured:
Character state

* appearance;
* voice;
* wardrobe;
* emotion;
* physical state;
* position;
* direction;
* action;
* props;
* knowledge;
* relationships.

Location state

* canonical reference;
* architecture;
* spatial layout;
* permanent furniture;
* permanent props;
* entrances;
* lighting;
* weather;
* time.

Story state

* timeline;
* completed events;
* open events;
* relationships;
* knowledge;
* goals;
* permanent changes.

Shot state

* previous shot;
* opening composition;
* ending composition;
* positions;
* movement;
* screen direction;
* camera;
* framing;
* props;
* dialogue timing;
* lighting;
* continuity requirements.

14. SHOT BOUNDARIES
Every boundary:
CONTINUOUS
CUT
or
TRANSITION
Continuous preserves physical state and action.
Cut intentionally changes camera/framing while preserving story/action continuity.
Transition intentionally changes time/location/state.
Never use black frames/fades/dissolves to hide continuity problems.
15. PROFESSIONAL AUDIO
Dialogue:
script
→ speaker
→ persistent MOSS voice
→ authoritative audio
→ Qwen3-ASR
→ Qwen aligner or WhisperX for Arabic
→ shot timing
→ H3
→ visual QA.
Sound design:
use MOSS-SoundEffect v2.0 plus appropriate real/library sound where useful.
Do not create silent, lifeless films.
Do not add random noise either.
Sound must be story-driven.
16. PHASE ORDER
Follow exactly:
PHASE 0 — Qwen3.8 foundation
Finish vLLM.
Download/verify:
`Inferact/Qwen3.8-27B-NVFP4`.
Start it.
Run direct inference.
Validate JSON/schema.
Connect Vewbox.
Run a real planner task.
Make it the ONLY active planner.
Exit:
Qwen3.8 NVFP4 is genuinely running Vewbox.
PHASE 1 — Characters + persistent voice
Through REAL UI create:

* Actor;
* Singer;
* Actor + Singer.

Establish:

* one canonical image;
* persistent voice;
* identity lock;
* language capability.

Test:

* Cartoon;
* Anime;
* Realistic.

Generate distinct requested sentences with the SAME character voice.
Verify persistence.
Exit:
professional persistent performer identity works.
PHASE 2 — Standalone music
NO VIDEO.
Qwen3.8:
concept
→ lyrics
→ song structure
→ performer assignment.
ACE-Step:
→ authoritative song.
Use ComfyUI where appropriate.
English first.
Listen to the entire generated song.
Validate:

* coherent composition;
* vocalist;
* lyrics;
* timing;
* no duplication;
* no corruption;
* proper beginning/end.

Exit:
professional standalone song generation works.
PHASE 3 — Iraqi Arabic
Establish natural Iraqi/Baghdadi voice.
Do not treat MSA as Iraqi.
Test:

* natural conversation;
* emotion;
* names;
* local phrases;
* longer speech.

Use:
Qwen3-ASR

* WhisperX alignment.

Native Iraqi listener QA is mandatory.
Then produce one Iraqi Arabic song.
Validate:

* Iraqi lyrics;
* dialect;
* pronunciation;
* rhythm;
* intelligibility;
* natural singing.

Exit:
Iraqi speech + Iraqi song work.
PHASE 4 — Music Video
MUSIC FIRST.
Song exists before video.
Qwen3.8
→ concept
→ treatment
→ performer assignment
→ storyboard
→ shot plan.
ACE-Step
→ authoritative song.
HTDemucs-FT
→ stems where useful.
Qwen3-ASR / aligner
→ vocal timing.
Qwen Image
→ performer/location/keyframes.
Qwen Image Edit
→ consistency.
MiniMax H3
→ actual video.
FFmpeg/Vewbox
→ song-locked final edit.
Do not use LatentSync on singing.
Assigned singer must visibly sing.
No random background singer.
No duplicate vocals.
No duplicate song.
Exit:
complete Music Video from real UI.
PHASE 5 — Shows / Seasons / Episodes
Hierarchy:
Show
→ Season
→ Episode
→ Scene
→ Shot
→ Take/Asset.
Show owns:

* universe;
* World Bible;
* cast;
* locations;
* timeline;
* relationships;
* rules;
* visual language;
* music identity.

Season continues the same world.
Episode inherits history/state.
Episode N+1 remembers Episode N.
Test:
2–3 shots
→ 4–8 shots
→ multi-scene
→ complete episode
→ 5–10 minute episode.
Exit:
long-form continuity works.
PHASE 6 — Shorts
Create one complete professional:

* Cartoon Short;
* Anime or Realistic Short as appropriate for validation.

It still requires:

* story;
* character;
* location;
* voice;
* sound;
* storyboard;
* edit;
* export.

Exit:
Shorts work as finished films.
PHASE 7 — Complete studio hardening
Test:

* Actor;
* Singer;
* Actor+Singer;
* English;
* Iraqi Arabic;
* Songs;
* Music Video;
* Short;
* Show;
* Season;
* multiple Episodes;
* recurring locations;
* recurring characters;
* persistent voices;
* restart recovery.

Kill/restart worker during one production and confirm safe resume.
17. CARTOON / ANIME / REALISTIC QUALITY
Cartoon:

* expressive posing;
* stable identity;
* polished materials;
* cinematic lighting;
* purposeful motion;
* feature-animation production discipline.

Anime:

* stable line language;
* stable eyes;
* stable face;
* stable hair;
* stable proportions;
* anime-specific posing;
* cinematic anime compositing.

Never paste realistic mouths onto anime.
Realistic:

* stable face;
* skin;
* eyes;
* hands;
* teeth;
* hair;
* wardrobe;
* believable interaction;
* consistent lighting.

18. RELIABILITY
Every job has:

* UUID;
* dependencies;
* progress;
* deterministic inputs;
* exact model provenance;
* refs;
* cancellation;
* timeout;
* restart recovery;
* safe resume;
* failure classification.

Failed shot does not restart completed shots.
19. GPU RESOURCE RULE
One RTX 5090.
Only one major GPU workload at a time unless explicitly proven safe.
Production beats benchmarking.
Do not let agents fight for VRAM.
Unload one large model before loading another.
20. REAL MEDIA IS THE TEST
Tests support quality.
Tests do not prove quality.
You must:
WATCH THE VIDEO.
LISTEN TO THE AUDIO.
Inspect actual output at normal speed.
Check:

* identity;
* voice;
* singing;
* continuity;
* sound;
* lighting;
* movement;
* framing;
* duplicates;
* black frames;
* freezes;
* A/V sync.

21. ROOT-CAUSE RULE
If something fails:
preserve
→ identify stage
→ diagnose cause
→ fix cause
→ regenerate only affected asset
→ verify.
Do not hide defects with retries or postprocessing hacks.
22. STATUS FILE
Maintain:
`docs/PRODUCTION-EXECUTION-STATUS.md`
Only record:

* phase;
* status;
* commit;
* models active;
* real artifact;
* first-attempt result;
* defects;
* fixes;
* blocker.

No huge diary.
23. START NOW
Stop conflicting old planner/model work.
Keep the valid resumable vLLM fetch.
Use only:
Inferact/Qwen3.8-27B-NVFP4
as the target production brain.
Securely use the local Hugging Face token for authenticated/resumable downloads without ever exposing it.
Finish Phase 0.
Then follow the phases in this directive continuously.
Do not ask between normal steps.
Do not start broad research again.
Do not restore old productions.
Do not create another experimental model zoo.
Build Vewbox as a complete, professional, persistent AI film studio.
START NOW.
