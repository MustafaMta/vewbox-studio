# Priority update — upgrade to high-capacity models in parallel with completion (producer, 2026-10-06)

Binding together with docs/directives/CLOUD-SESSION-DIRECTIVE-2026-10-05.md and the English-first order. GPU work
from outside the worker runs under the studio's GPU lease: `scripts/gpu-hold.ts <FAMILY> <estimateMb> -- <command>`.

The producer's text follows verbatim.

---

PRIORITY UPDATE — UPGRADE TO HIGH-CAPACITY MODELS IN PARALLEL WITH COMPLETION
Continue the current local recovery, regression tests, continuity/lip-sync implementation and UI acceptance work exactly as planned.
Do not stop or delay the code work.
In parallel, assign dedicated model engineers to upgrade and benchmark the current AI stack.
My preference is now explicit:
Do not keep small/lightweight model variants as the production default merely because they are easier or faster to run.
Prefer the strongest practical high-capacity models that produce materially better output and can run reliably with the RTX 5090 32 GB VRAM + ~80 GB Docker/WSL RAM through staged loading, CPU offload and supported quantization where appropriate.
Parameter count alone is not enough. The final choice must be based on real Vewbox output quality, stability, licensing and first-attempt success.

## 1. Run model work in parallel with engineering
Use separate agents for:
- frontend/backend completion;
- continuity and World Bible;
- MiniMax H3 continuation;
- audio/lip-sync;
- image-model benchmarking;
- planning/LLM benchmarking;
- voice-model benchmarking;
- independent QA.

Do not allow multiple GPU-heavy inference jobs to fight for the RTX 5090.
Code/research/testing agents can run in parallel, but GPU model evaluation must be scheduled sequentially where necessary.

## 2. Image models — do not settle for lightweight defaults
Review the current image stack.
In particular, do not automatically keep lightweight variants such as `FLUX.2 klein` as the final production engine.
Evaluate the strongest practical current high-capacity FLUX and Qwen image/editing models.
Benchmark them using the same Vewbox inputs for:
- Cartoon character;
- Anime character;
- Realistic character;
- image-reference character creation;
- identity-preserving edit;
- canonical location;
- recurring location;
- film poster;
- scene reference;
- multi-character composition.

Measure:
- face/identity fidelity;
- full-body anatomy;
- hands;
- instruction adherence;
- reference-image adherence;
- style consistency;
- location consistency;
- first-attempt success;
- VRAM/RAM;
- latency;
- failure rate.

Prefer the higher-capacity model when it provides a meaningful quality improvement.
Do not keep several image engines without a clear demonstrated role.

## 3. Planning / story / agents
The current planner must not be considered final just because Gemma works.
Benchmark Gemma against stronger practical large Qwen or other suitable local models for:
- screenplay writing;
- long-story planning;
- scene breakdown;
- shot planning;
- structured JSON;
- World Bible reasoning;
- character continuity;
- production coordination;
- long-context consistency.

Use real Vewbox story tasks.
Evaluate long responses for truncation, schema adherence, story coherence and consistency over many scenes.
Select the strongest practical production model, not simply the fastest.

## 4. MiniMax video remains exclusive
MiniMax H3 remains the only video-generation engine.
Do not add Wan, LTX or another video generator.
Confirm that the local H3 installation/configuration is the highest-quality supported local configuration available to this project.
If multiple H3 checkpoints/configurations exist locally, benchmark the strongest supported one.
Optimize MiniMax for quality before speed.
Continue implementing:
- canonical character references;
- canonical location references;
- first/last-frame continuation;
- configurable guide frames;
- audio-guide handling where supported;
- Continuous / Cut / Transition semantics;
- duplicate guide removal;
- temporal continuity;
- stable world state.

## 5. Voice models
Keep English as the current film-pipeline acceptance language.
Do not lock IndexTTS as the permanent voice engine merely because it currently works.
Once the English core pipeline is stable enough for comparison, benchmark the strongest practical voice systems for:
- persistent speaker identity;
- emotional delivery;
- long lines;
- short lines;
- pronunciation;
- timing;
- first-attempt reliability;
- voice cloning/reference quality.

Later, in the Iraqi Arabic phase, explicitly compare IndexTTS, Fish Audio and other strong suitable candidates using the same Iraqi test corpus and native Baghdadi listener review.

## 6. Lip-sync is mandatory
Continue the audio-first architecture already being implemented:
authoritative final voice audio → forced alignment → shot timing → MiniMax performance → automated QA → visual review → targeted lip-sync correction if necessary.
Automated mouth activity and alignment scores do not count as acceptance.
Inspect real generated video visually at normal playback speed.
If a post-process lip-sync tool is required, select the strongest compatible solution that preserves character identity.

## 7. Real UI testing — not scripts only
All selected production models must ultimately be tested through the actual Vewbox UI.
Do not consider a model integrated because a Python script or ComfyUI workflow works independently.
From the UI verify:
- Auto character;
- Manual character;
- reference-image character;
- Cartoon;
- Anime;
- Realistic;
- voice creation;
- persistent identity;
- story generation;
- scene generation;
- shot generation;
- continuous MiniMax shots;
- Cut;
- Transition;
- return to known location;
- lip-sync;
- subtitles;
- editing;
- export;
- restart/recovery.

## 8. Finish the complete product while models are evaluated
Continue simultaneously fixing and completing:
- all frontend pages;
- creation flows;
- World Bible;
- Location Bible;
- structured production state;
- shot-boundary handling;
- audio-first dialogue;
- continuity QA;
- worker recovery;
- targeted regeneration;
- Final Cut;
- subtitles;
- export;
- engine room;
- browser tests;
- reliability defects.

Do not pause engineering while waiting for model comparisons.

## 9. Production model promotion rule
Never replace the current production model immediately after downloading a larger one.
Use:
candidate → benchmark → real UI test → quality comparison → promote
Keep the existing working model until the replacement proves better.
For every promoted model record:
- exact model/checkpoint;
- parameter size if known;
- precision/quantization;
- VRAM peak;
- RAM peak;
- latency;
- license;
- first-attempt success;
- quality result;
- reason it replaced the previous model.

## 10. Acceptance remains film-based
After the stronger models are integrated, continue the existing English acceptance sequence:
1. persistent English voice;
2. speaking character;
3. real lip-sync;
4. two-shot Continuous sequence;
5. 4–8-shot scene;
6. intentional Cut;
7. Transition;
8. return to established location;
9. complete Short;
10. complete Music Video;
11. complete 5–10 minute episode.

The final outputs must demonstrate:
- stable characters;
- stable environments;
- continuous motion;
- persistent voice;
- accurate lip-sync;
- proper audio;
- no repeated guide frames;
- no duplicate audio;
- no unnecessary fades/black frames;
- professional editing;
- clean exports.

If a larger model does not improve real output, do not select it just for parameter count.
If a larger model does improve quality but requires careful staged loading/offload, implement that properly rather than automatically falling back to a smaller model.
Start the model-upgrade work now in parallel with the current engineering and acceptance work. Continue autonomously and do not stop at research or downloads. Implement, benchmark, integrate and test through the real UI.
