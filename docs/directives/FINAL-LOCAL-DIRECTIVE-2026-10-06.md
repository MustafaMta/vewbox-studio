# Vewbox Studio — final local execution directive (producer, 2026-10-06)

Binding, together with docs/directives/MODEL-UPGRADE-DIRECTIVE-2026-10-06.md and CLOUD-SESSION-DIRECTIVE-2026-10-05.md.
Coordinator's decisions recorded with it:
- LatentSync and alternatives are now evaluated (§16 asks for it; the older "LatentSync excluded" policy is lifted for
  evaluation). InsightFace packs stay out (non-commercial): LatentSync runs with a YuNet + MediaPipe detector adapter.
- GPU work outside the worker goes through `scripts/gpu-hold.ts`.

**Producer's model-size policy (2026-10-06, later):** general-purpose production models target the **27B–30B class**
(planning, story, screenplay, agent reasoning, World Bible and continuity reasoning, multimodal reasoning, and
image generation/editing where a comparable option exists). Do not download or evaluate 122B-class models at this
stage (no Qwen3.5-122B, no gpt-oss-120b). Smaller general-purpose models (7–14B) stay only as development, fast-preview
or emergency fallbacks, never the production default unless no materially better 27–30B alternative exists.
Specialist models (ASR, forced alignment, lip-sync, face detection/embeddings, VAEs, audio encoders, upscalers, QA
models) are exempt: use the strongest proven specialist regardless of size. Every model choice is proved through real
Vewbox UI output before promotion. Model benchmarking never blocks the filmmaking acceptance, which continues in
parallel. The repeated Docker Desktop crash is an open reliability defect to investigate.

**Producer's licence decision (2026-10-06): commercial-safe models only.** Vewbox must be usable commercially. Do not
download or integrate non-commercial weights (FLUX.2 [dev], FLUX.2 klein 9B under the FLUX Non-Commercial licence,
Fish Audio research licence, CC-BY-NC, etc.) into the runtime, production configuration or any required workflow. A
non-commercial model may be recorded as a research reference (and compared in an evaluation, clearly labelled), never
promoted. Keep searching for the strongest commercially usable high-capacity models (Qwen family, JoyAI and others with
verified terms), with staged loading/offload/quantization rather than a smaller model. For every candidate verify the
exact model/version, parameter count, licence and commercial-use terms, editing capability, identity preservation,
anatomy, style quality, character and location consistency, first-attempt success, VRAM/RAM and latency, and run the
real comparison through the Vewbox UI before promoting. If a commercial BFL licence is bought later, FLUX is
re-evaluated separately without redesigning the image pipeline.

The producer's text follows verbatim.

---

You are now operating on my local workstation with the RTX 5090.
Continue from the existing Vewbox Studio repository and all completed work. Do not restart the project, redesign completed areas unnecessarily, or repeat research already settled unless new evidence requires it.
Your responsibility is to complete Vewbox Studio as a professional, reliable AI filmmaking platform and verify it through actual films generated from the real UI.
Work autonomously.
Do not repeatedly ask me about ordinary engineering decisions.
Do not stop at research, documentation, unit tests, API success, model downloads, or one successful clip.
Continue through implementation → integration → testing → real media generation → quality review → defect correction → final delivery.

## 1. Current hardware and execution environment
NVIDIA RTX 5090 (~32 GB VRAM); ~95 GB system RAM; WSL/Docker ~80 GB RAM and 32 GB swap; local Docker, ComfyUI, model storage, PostgreSQL, existing Vewbox media and acceptance evidence.
All production inference should remain local where already designed to be local.
MiniMax H3 is the only video-generation engine. Do not introduce Wan, LTX or another video generator. Do not depend on a hosted MiniMax API.
Confirm that video generation actually runs in the local MiniMax/ComfyUI environment on the RTX 5090.

## 2. Preserve all existing work
Preserve source code; Git history; `.env*`; database; `var/`; generated acceptance evidence; backups; model weights; ComfyUI models; ComfyUI workflows; canonical character assets; location references; existing production state.
Do not reset or wipe the working studio unless a specific controlled cleanup step has been approved by the existing directives.
Do not restart acceptance work that has already passed unless a code change invalidates that specific result.

## 3. Complete current local recovery first
Verify: all cloud-session commits merged into `main`; migration `0027` applied safely; PostgreSQL backup exists; typecheck, unit tests, Python service tests, worker tests and browser/E2E tests pass locally; the media tests that could not run in cloud Chromium are verified locally with H.264/AAC playback; ASR container includes the new alignment and QA dependencies; ComfyUI, voice service, ASR/forced-alignment service, worker/orchestrator and frontend/backend are healthy.
Keep generation intake paused until the entire local environment is verified.

## 4. Run multiple specialized engineering agents in parallel
Responsibilities: frontend/product engineer; backend/reliability engineer; model-evaluation engineer; image-generation engineer; MiniMax video engineer; continuity engineer; audio engineer; lip-sync engineer; editing/export engineer; DevOps/GPU engineer; independent QA engineer.
Parallelize CPU/code/research work. Do not run competing GPU-heavy inference workloads at the same time. Coordinate GPU tasks through explicit scheduling.

## 5. High-capacity model upgrade is now a priority
The current model choices are not automatically final. I want the strongest practical models, not lightweight models selected mainly because they are easier to run. Prefer larger/high-capacity models where they demonstrate materially better quality. However, parameter count alone is not the acceptance criterion.
Judge every candidate on output quality; identity fidelity; reference adherence; stability; first-attempt success; VRAM/RAM requirements; inference latency; licensing; integration reliability.
Use staged loading, CPU offload, supported quantization and unloading between stages when necessary. Do not silently fall back to weaker small models simply because the larger model needs careful memory management.

## 6. Image model evaluation — Qwen and FLUX
Review the current image-generation stack. Do not assume `Qwen-Image-2512`, `FLUX.2 klein`, or another existing model is the final choice. Evaluate the strongest practical current high-quality Qwen and FLUX models available for this hardware, especially higher-capacity variants. Run controlled A/B tests using exactly the same Vewbox briefs and references.
Test: Cartoon, Anime and Realistic characters; Auto, Manual and image-reference character creation; identity-preserving edits; full-body front canonical character; anatomy; hands; facial identity; wardrobe; canonical location; recurring location; scene reference; film poster; multi-character composition.
Measure: first-attempt success; identity consistency; prompt adherence; reference fidelity; anatomy; style consistency; location consistency; VRAM; RAM; latency; failure rate.
Do not keep `FLUX.2 klein` as the production reference-image model merely because it is lightweight; benchmark it against stronger practical alternatives. Promote a model only when evidence shows that it is the right production choice.

## 7. Story / planning / agent model evaluation
Gemma is not automatically the permanent planner. Evaluate strong high-capacity local models, including suitable Qwen-family candidates and other production-suitable models, on real Vewbox tasks: concept development; long-form story writing; screenplay generation; character development; scene breakdown; shot planning; structured JSON; World Bible reasoning; location reasoning; state tracking; continuity reasoning; long-context consistency; agent/tool usage.
Test schema correctness; truncation; hallucination; continuity across scenes; long-response stability; instruction adherence. Use the strongest practical model that performs best in actual Vewbox workflows.

## 8. MiniMax H3 video — exclusive engine
Verify the exact checkpoint/configuration; local model files; workflow version; ComfyUI nodes; precision; VRAM behavior; continuation capabilities; character-reference capabilities; location-reference capabilities; audio-conditioning capabilities where supported.
Use the highest-quality practical configuration. Optimize for quality before speed. Do not introduce another video engine as a fallback.

## 9. Mandatory professional AI filmmaking research
Perform focused internet research into how current professional AI filmmakers, production companies, experienced creators, research teams and strong open-source projects achieve reliable long-form filmmaking — GitHub, technical documentation, model documentation, research papers, engineering blogs, public production breakdowns, ComfyUI workflows, AI-film case studies, experienced creator workflows, open-source filmmaking pipelines; not marketing pages.
Investigate: long-form character consistency; stable faces; stable body proportions; wardrobe continuity; persistent locations; environment continuity; shot-to-shot temporal continuity; action continuation; first-frame/last-frame conditioning; reference conditioning; keyframe anchoring; motion matching; camera continuity; screen direction; visual re-anchoring; dialogue timing; persistent voices; lip-sync; singing synchronization; authoritative audio timelines; multi-scene editing; continuity QA; drift detection; targeted regeneration; production recovery.
Also study professional film-production concepts where they improve AI generation: character bible; model/reference sheet discipline; location bible; continuity log; blocking; shot list; action matching; screen direction; lighting continuity; color continuity; editorial continuity; authoritative sound timeline.
Deeply inspect `https://github.com/lumosai8/MinimaxStoryBuilder` including its actual source code and workflow behavior, and other relevant projects. Pipelines using other video models may be studied for architectural ideas, but Vewbox uses MiniMax H3 only.
For every useful technique: identify the problem it solves; whether it is model-specific; whether MiniMax H3 supports an equivalent; compare with Vewbox; implement; test; validate through real Vewbox media. Research → decide → implement → test. Do not stop at a research document.

## 10. Redesign film generation around structured production state
Every shot must inherit structured production state, stored in the backend and database — not only in LLM context.
- Character state: canonical front full-body image; persistent voice identity; wardrobe; current physical condition; emotional state; scene position; relationships; current action.
- Location state: canonical location reference; architecture; room/environment layout; permanent objects; props; spatial relationships; lighting; weather; time of day.
- Shot state: previous approved shot; beginning pose; ending pose; current action; motion direction; camera position; lens/framing; screen direction; required characters; required props; dialogue timing; continuity constraints.
- Story state: completed events; character knowledge; relationships; current objective; timeline; persistent changes.

## 11. World Bible and Location Bible
Complete the persistent World Bible and Location Bible. Returning to the same place must not produce a random new room/building/environment. Preserve architecture; layout; furniture; permanent props; colors; lighting rules; spatial relationships; time/weather state when appropriate. Intentional story changes are allowed; unintentional drift is not.

## 12. Character identity contract
One character = one canonical front full-body image + one persistent voice identity. Do not require multiple canonical side/back views. Temporary production references may be created internally where necessary; they must derive from the canonical identity, remain traceable, never replace the canonical image and never clutter the character profile as additional identities. Re-anchor the canonical identity throughout long productions; do not depend only on frame chaining.

## 13. Three shot-boundary modes
- Continuous: continue the same physical action. Preserve pose; movement; screen direction; props; environment; lighting; characters; audio state. Use supported previous-shot ending conditioning.
- Cut: intentional camera change while preserving characters; clothing; location; props; current action; story state.
- Transition: deliberately establish a new time/place/state using canonical location/story references; do not accidentally carry the previous scene forward.
Do not use fades, dissolves or black frames to hide broken continuity.

## 14. MiniMax continuation pipeline
Fully implement: approved previous-shot lookup; final-frame extraction; configurable guide-frame extraction; guide validation; audio-guide extraction where supported; canonical character reference injection; canonical location reference injection; continuation prompt construction; temporal conditioning; duplicate guide-frame removal; duplicate audio removal; timestamp correction; assembly validation. Do not hard-code MinimaxStoryBuilder's 22-frame value universally; put model-specific continuation behavior in capability/configuration data.

## 15. Audio-first dialogue
One authoritative audio source. Order: 1 finalize script; 2 select speaker; 3 select/generate persistent voice; 4 create final dialogue audio; 5 determine exact duration; 6 forced alignment; 7 word/phoneme timing; 8 plan performance around that audio; 9 generate video; 10 measure lip-sync; 11 visually inspect; 12 targeted correction only if needed.
MiniMax must not randomly create different dialogue and then have the mixer layer another voice on top. There must be one authoritative spoken performance.

## 16. Lip-sync is a hard acceptance requirement
Current output has shown insufficient lip-sync; treat this as a major production defect. Forced alignment, word timing, mouth activity, lag estimation and face identity scores are QA signals; they do not prove lip-sync. Inspect real generated videos at normal playback speed. Evaluate current high-quality lip-sync approaches where necessary — research LatentSync, current strong alternatives, forced aligners, audio-conditioned facial-performance techniques. Prefer native MiniMax performance when it is sufficiently good; use post-processing only where needed. A lip-sync correction stage must not alter facial identity, expression, character appearance or intended cinematography.

## 17. Music video pipeline
One authoritative song. Store lyric timestamps; performer assignment; lead vocalist; backing vocalist; instrumental segments; shot timing. The correct character must visibly perform the assigned vocal segment; background characters must not randomly sing. Do not duplicate the soundtrack. Verify singing lip-sync.

## 18. Voice models
English remains the current acceptance language. Do not automatically treat IndexTTS as the final production voice system. Benchmark high-quality practical voice systems for persistent speaker identity; emotional control; pronunciation; long lines; one-word/short lines; consistency across sessions; timing; cloning/reference quality; first-attempt reliability.
After the English filmmaking pipeline is stable, run a dedicated Iraqi Arabic phase comparing IndexTTS, Fish Audio, MiniMax-supported voice mechanisms and other strong suitable candidates on the same Iraqi Arabic test corpus, with native Baghdadi listening review. Whisper/ASR is diagnostic evidence only.

## 19. Continuity QA
Automatically inspect each take for face identity drift; body drift; wardrobe drift; location drift; prop inconsistency; temporal discontinuity; freeze frames; duplicate frames; black frames; accidental fades; motion discontinuity; duplicated audio; dialogue timing; lip-sync; duration; codec/container correctness. Quality failures must remain visible. Do not silently regenerate until something passes.

## 20. First-attempt reliability
Before any expensive inference, validate model availability; GPU resources; required references; canonical character state; location reference; production state; dialogue audio; timing; guide frames; output storage; model capabilities. Record attempt #1 separately. If quality fails: preserve the failed output; diagnose root cause; correct the cause; rerun only when justified. Do not hide repeated attempts.

## 21. Complete the entire application in parallel
Finish and verify Home; Shows; Seasons; Episodes; Shorts; Music Videos; Characters; Locations; Studio Company; Production; Story planning; Scene planning; Shot workspace; Screening Room; Editing; Final Cut; Export; Settings; Engine Room; every creation flow; every error state; every loading state. Remove placeholder and fake functionality; every visible control must have a real implementation.

## 22. Real UI acceptance
Model testing must ultimately happen through the real Vewbox UI. Test through the interface: Auto, Manual and image-reference characters; Cartoon; Anime; Realistic; voice; story; scene; shot; location; continuity; regeneration; editing; subtitles; export; recovery — at 1440px, 1920px and 390px.

## 23. Resume the existing English acceptance run
Do not restart passed gates. Continue: 1 persistent English voice; 2 real speaking character; 3 real lip-sync; 4 two-shot Continuous action; 5 4–8-shot continuous scene; 6 intentional Cut; 7 Transition; 8 return to established location; 9 complete Short; 10 complete Music Video; 11 complete 5–10 minute episode. The last three continuity requirements may be incorporated inside the main productions if explicitly tested and documented.

## 24. Film quality standard
Not unrelated AI clips. The viewer must perceive the same character, face, body and wardrobe; the same environment; continuous action; intentional camera changes; stable lighting; stable props; persistent voices; accurate lip-sync; continuous sound; coherent story state; professional editing. Target the production discipline and polish of Pixar, Disney Animation, Illumination, premium Netflix productions and leading Japanese anime studios — quality references only; Vewbox productions remain original.

## 25. Model promotion rule
candidate → controlled benchmark → real UI test → compare → promote. Record for each promoted model: exact name/checkpoint; parameter count; precision/quantization; VRAM peak; RAM peak; latency; license; first-attempt rate; benchmark results; reason for selection. If a large model materially improves quality but requires staged loading or CPU offload, implement that properly instead of automatically choosing a weaker small model.

## 26. Failure and recovery testing
Test worker kill during production; worker restart; container restart; GPU OOM; invalid input; missing reference; corrupted output; duplicate submission; cancelled job; interrupted export. Production state must recover without corruption. A failed shot must not require regenerating the whole film.

## 27. Evidence bundle for every acceptance production
Preserve original brief; story; characters; canonical references; voice identities; locations; shot plan; MiniMax inputs; model versions; first attempts; retries; failure causes; GPU measurements; approved takes; audio timeline; final export; QA findings. Evidence must survive restarts.

## 28. Iraqi Arabic phase comes after English stability
Once the English Short, Music Video and long-form episode pipeline is stable, start the dedicated Iraqi Arabic phase: benchmark the strongest suitable voice systems; test authentic Baghdadi vocabulary; pronunciation; conversational rhythm; male/female voices; emotional delivery; long and short speech; names; numbers; English code-switching; voice persistence; lip-sync. A native Iraqi listener gives final dialect acceptance.

## 29. Do not waste time
Avoid repeated general research; repeated architecture plans; rewriting completed UI without a defect; repeatedly running the complete suite after tiny changes; duplicate agents performing the same work; unnecessary worktrees; unnecessary database copies; unnecessary model downloads. Use focused tests during implementation; run full regressions at meaningful checkpoints.

## 30. Execution rule
inspect → research when necessary → implement → test → integrate → generate → inspect media → correct.
Do not stop at intermediate success. Do not claim features complete without evidence. Do not claim lip-sync from metrics alone. Do not claim continuity from one frame. Do not claim Iraqi authenticity from ASR.
The final product must produce coherent long-form films with persistent characters; persistent locations; continuous action; professional cuts; stable voices; convincing lip-sync; coherent sound; reliable editing; clean export.
Start now from the current local state.
