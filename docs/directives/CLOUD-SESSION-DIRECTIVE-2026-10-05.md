# Cloud session directive — finish Vewbox and prepare the real film pipeline (producer, 2026-10-05)

Binding for the cloud session, together with the earlier master directives (summarised in docs/REDESIGN-2026-10-03.md).
The English-first order (2026-10-05) stands: English is the reference language until the film pipeline is proven; Iraqi
Arabic is a dedicated final quality phase. MiniMax (local H3 on the workstation) is the only video engine. Operations:
docs/OPERATIONS-CLOUD.md. Acceptance checkpoint: docs/evidence/acceptance-v1/REPORT.md and resume.json.

The producer's text follows verbatim.

---

CLOUD SESSION DIRECTIVE — FINISH VEWBOX AND PREPARE THE REAL FILM PIPELINE
Continue from the current repository and existing master requirements.
My workstation and local ComfyUI/MiniMax GPU environment will be unavailable for a period of time.
Do not stop development because ComfyUI is offline.
Use the cloud session to complete every frontend, backend, orchestration, continuity, audio, lip-sync, testing and integration task that does not require the local RTX 5090.
When I later tell you the workstation is available again, the project should be ready to sync and immediately resume real MiniMax generation.

## 1. Continue working autonomously
Do not wait for my PC.
Do not repeatedly ask me for ordinary technical decisions.
Do not restart completed redesign work.
Do not spend days producing architecture documents without implementation.
Research specific technical problems, make decisions, implement them, test them, and continue.
Fix all currently known defects and all new defects found during testing.
Keep all cloud work pushed to the private GitHub repository regularly.

## 2. The current film output is not acceptable
Treat this as a critical fact:
The films generated so far are not sufficiently consistent, continuous or professional.
Existing problems include:
- character identity drift;
- face changes;
- body/clothing changes;
- environment/location drift;
- objects moving or disappearing;
- broken motion between shots;
- shots that feel unrelated;
- visible generation boundaries;
- poor continuity;
- audio inconsistencies;
- missing or poor lip-sync;
- incorrect mouth movement;
- weak long-form story continuity;
- scenes that do not feel like one professionally directed film.

Do not preserve the current generation architecture merely because it technically produces videos.
Diagnose why these failures happen and improve the pipeline.

## 3. Research how strong AI filmmaking systems handle long-form consistency
Perform focused internet and GitHub research on how current professional teams, open-source projects and AI filmmaking workflows solve:
- long-form character consistency;
- multi-shot temporal consistency;
- persistent locations;
- shot-to-shot continuation;
- reference conditioning;
- keyframe anchoring;
- first-frame/last-frame control;
- motion continuation;
- scene continuity;
- character voice persistence;
- dialogue timing;
- lip-sync;
- editing and assembly;
- long-form story state;
- production-state recovery.

Research real implementations and technical workflows, not only marketing pages.
Inspect code, papers, repositories, workflow files, technical posts and reproducible examples where available.
Include the existing mandatory investigation of:
`https://github.com/lumosai8/MinimaxStoryBuilder`
but do not stop there.
Study useful ideas from other systems even if they use different video models.
MiniMax must remain the only video-generation engine in Vewbox.
Other systems may be researched only for architecture, conditioning, continuity, scheduling, editing, reference management, audio or QA techniques.
Do not add Wan, LTX or another video generator.

For every technique found, determine:
- what problem it solves;
- whether it is model-specific;
- whether MiniMax H3 supports an equivalent mechanism;
- how it should fit Vewbox;
- what must be implemented before the workstation returns.

Do not copy projects blindly.

## 4. Redesign the generation pipeline around continuity
The pipeline must stop treating every shot like an isolated prompt.
Each generated shot must be created from structured production state.
Implement or complete a production context containing:

**Character state**
- canonical character image;
- persistent voice identity;
- current wardrobe;
- physical condition;
- emotional state;
- position in the scene;
- who the character is interacting with.

**Location state**
- canonical location reference;
- architecture;
- room layout;
- permanent furniture;
- important objects;
- spatial relationships;
- lighting;
- weather;
- time of day.

**Shot state**
- previous approved shot;
- current action;
- starting pose;
- ending pose;
- motion direction;
- camera;
- lens/framing;
- screen direction;
- dialogue timing;
- required props;
- continuity constraints.

**Story state**
- events already completed;
- relationships;
- current scene objective;
- information each character knows;
- important changes that must persist.

This must be structured state stored by the application, not information that exists only inside an LLM prompt.

## 5. Define three explicit shot-boundary modes
Every boundary must be classified as one of the following.

**Continuous.** The new shot continues the same physical action. Preserve:
- character positions;
- direction of movement;
- environment;
- props;
- lighting;
- action state;
- audio state.

Use the previous ending frames/audio as conditioning where the selected MiniMax workflow supports it.

**Cut.** Allow an intentional cinematographic camera change while preserving:
- character identity;
- location;
- wardrobe;
- props;
- story state;
- action continuity.

**Transition.** Deliberately establish a new time/place/state. Use the canonical location and current story state rather than accidentally carrying the previous image.

Do not use fades or black frames to hide failed continuity.

## 6. Prepare proper MiniMax continuation
Fully understand and prepare the MiniMax continuation implementation before the GPU returns.
Build the code paths for:
- approved-shot lookup;
- previous-shot ending extraction;
- configurable guide frame selection;
- optional matching audio extraction;
- MiniMax continuation conditioning;
- canonical character references;
- canonical location references;
- prompt/context construction;
- guide validation;
- output validation;
- duplicate guide-frame trimming;
- duplicated-audio trimming;
- timestamp repair;
- assembly.

Do not blindly hard-code the 22-frame MinimaxStoryBuilder value.
Model-specific continuation settings must live in capability/configuration data.

## 7. Audio-first performance and lip-sync
The lack of lip-sync is a major defect.
Redesign the speaking workflow so dialogue is treated as authoritative production audio rather than an afterthought.
For dialogue:
1. finalize the script;
2. assign the speaker;
3. generate/select the persistent voice;
4. generate the final dialogue audio;
5. measure exact duration;
6. obtain word/phoneme timing using the best practical forced alignment;
7. construct the shot around the authoritative audio;
8. generate the performance;
9. inspect lip-sync;
10. apply a lip-sync correction stage only when required.

Research and compare appropriate current tools for:
- forced alignment;
- phoneme/word timing;
- talking/singing synchronization;
- post-generation lip-sync.

Evaluate tools such as LatentSync and other strong current approaches.
Do not automatically apply a face-changing post-processing model to every shot.
Native MiniMax performance should be preferred when it is good enough.
Post-processing must preserve the face and character identity.
Prepare this entire architecture and integration while offline from the GPU.

## 8. Music video performance
Music video generation needs a separate performance workflow.
Implement:
- authoritative final song track;
- lyric timestamps;
- performer assignment by lyric segment;
- lead/backing vocal assignment;
- scene/shot timing derived from music;
- lip-sync/singing verification;
- prevention of random background characters singing;
- prevention of duplicate music/audio.

Music video generation must not use the same simplistic dialogue workflow as a normal film.

## 9. Character and location consistency
Maintain the established rule:
one canonical front full-body image + one persistent voice identity per character.
Do not introduce required multi-view canonical sheets.
However, the pipeline may create temporary internal shot references where technically needed.
Those references must be derived from and traceable to the canonical identity.
Every appropriate shot must re-anchor the relevant characters and locations.

Do not rely only on:
- text prompts;
- LLM memory;
- previous final frame.

Long sequences must periodically re-anchor to canonical references so identity drift does not accumulate.

## 10. Build automated continuity QA
Prepare QA that can run automatically after GPU generation resumes.
Each shot should be checked for:
- character identity similarity;
- facial drift;
- wardrobe drift;
- location similarity;
- scene-object consistency;
- temporal discontinuity;
- frame duplication;
- black frames;
- accidental fades;
- freeze frames;
- motion discontinuity;
- audio duplication;
- dialogue timing;
- lip-sync score;
- duration correctness;
- output codec/container validity.

Automated QA must flag problems.
It must not silently regenerate until something passes.
Quality failures must remain visible in production history.

## 11. Prepare first-attempt reliability
Before calling MiniMax, validate:
- models available;
- required references exist;
- approved canonical characters exist;
- location plate exists where needed;
- audio is finalized;
- timing is valid;
- shot duration is valid;
- continuation guide is valid;
- resources are available;
- output storage is available;
- prompt/context is complete.

This validation should prevent avoidable bad generations.
Track attempt #1 separately from retries.

## 12. Finish the rest of the application while GPU is offline
Complete everything cloud-safe:
- frontend defects;
- responsive issues;
- all creation workflows;
- production workspace;
- World Bible;
- Location Bible;
- continuity screens;
- agent execution;
- backend APIs;
- database constraints;
- orchestration;
- durable jobs;
- worker recovery;
- cancellation;
- leases;
- targeted shot regeneration;
- editing;
- final-cut logic;
- subtitles;
- export pipeline;
- engine-room reporting;
- logs;
- error messages;
- browser tests;
- unit tests;
- integration tests;
- clean startup.

Eliminate placeholder/fake functionality.
Every visible control must either work or clearly indicate that a local inference dependency is currently offline.

## 13. Build test fixtures without faking generation
Cloud testing may use deterministic fixtures for UI/backend tests, but clearly distinguish them from real generated media.
Do not report fixture-based tests as film-generation acceptance.
Do not replace MiniMax with a fake generator and claim completion.
Use fixtures only to validate:
- state transitions;
- UI behavior;
- job recovery;
- editing;
- persistence;
- assembly logic;
- failure handling.

## 14. Prepare a one-command local resume
Before the workstation returns, prepare a reproducible resume path.
When I tell you the PC is available again, it should require as little manual setup as possible.
Prepare:
- Docker Compose/services;
- health checks;
- model-path verification;
- GPU capability verification;
- ComfyUI workflow validation;
- model inventory;
- database migrations;
- worker startup;
- generation intake;
- acceptance-run resume.

Ideally provide one documented command/script that:
1. checks Docker/WSL resources;
2. verifies RTX 5090 availability;
3. verifies model files;
4. starts required inference containers;
5. starts Vewbox services;
6. runs health checks;
7. resumes the paused acceptance production safely.

## 15. Do not lose the current acceptance state
Preserve the current acceptance checkpoint and production evidence.
When the workstation returns, do not start from scratch.
Resume from the saved gate unless code changes invalidate that specific step.

## 16. When the RTX 5090 returns
Once I tell you the PC and ComfyUI are available, immediately sync the cloud changes and run real generation tests in this order:
1. one English voice;
2. one speaking character;
3. lip-sync validation;
4. two-shot continuous action;
5. 4–8 shot continuous scene;
6. intentional camera cut;
7. scene transition;
8. return to established location;
9. complete Short;
10. Music Video;
11. 5–10 minute episode.

Do not proceed past a failed gate without diagnosing and correcting the root cause.

## 17. Final quality target
Vewbox must not merely create a sequence of AI clips.
It must behave like a film-production system.
The viewer should perceive:
- the same characters;
- the same places;
- continuous action;
- intentional camera decisions;
- coherent editing;
- stable voices;
- believable dialogue;
- convincing lip movement;
- continuous sound;
- persistent story state.

Target the production discipline, coherence and polish associated with major professional animation and entertainment productions while keeping Vewbox's films original.
Do not copy protected characters, films or studio-specific artwork.

## 18. Execution rule
Continue autonomously while the workstation is offline.
Research → implement → test → integrate.
Do not repeatedly stop at reports.
Do not wait for ComfyUI for tasks that can be completed in the cloud.
Push completed work regularly to the private repository.
Keep progress reports concise.
When GPU-specific validation is the only remaining blocker for a feature, mark it clearly as:
READY FOR LOCAL GPU ACCEPTANCE
and continue to the next cloud-safe task.
The goal is that when I power the workstation back on, we are not returning to architecture work. We immediately start real generation and prove that the new pipeline produces continuous, consistent, stable films with correct lip-sync.
