# Final report — Vewbox Studio, the multi-agent AI film studio on the RTX 5090

Status as of 2026-10-02, evening. The evidence behind every row is in `IMPLEMENTATION-CHECKLIST.md`; nothing below is
called done unless it ran on this machine and left a record. Earlier phases of the same build (the MiniMax-only
pipeline, the audiovisual corrections) are summarised in §1 and kept in the checklist rows 0–13.

## 1. What exists

**The product.** Shows (seasons, episodes, cast, world, bible), Shorts, Music Videos and Characters, each with its
own catalog and detail page, and a Studio Company page that shows the virtual film studio making them. Five areas
first; Production (pipeline positions, activity), Locations, Assets and Settings behind the scenes.

**The studio.** An Executive Office and eight departments (Story Development, Casting & Character Design, World
Building & Art Direction, Pre-Production, Video Production, Sound & Music, Post-Production, Quality Assurance) with
51 named agents, 18 typed tool contracts and 11 versioned skills (Anthropic Agent Skills format), defined in code and
persisted with a version. Every job the worker runs is executed *as* an agent: a run record with its tool calls and
outcome, a failure class on failure, a reliability event per repeated attempt, a studio event per thing done. The
Studio Orchestrator's state and every department's light on the company page are derived from those records.

**The pipeline.** Story → Cast & world → Script → Storyboard → Shot plan → Audio preparation → Video → QA → Edit →
Export, each stage owned by a department and ending in a handoff artifact with named checks; QA inspectors record
reports on takes, songs, cuts and exports; two decisions are a person's (the story before production, the cut before
export) and block the gated jobs until given. Preflight validation refuses a generation that could not succeed, with
a failure class; only infrastructure/provider/resource failures are retried blindly; a retry asks what changed and
records it.

**Continuity.** A show's language, dialect and direction are its identity and are never changed by a season or
episode proposal; seasons and episodes are proposed from every season's arc, the previous episodes and where each
left the story, the bible (rules, relationships, timeline, open storylines) and the locked cast by id; the
Continuity Writer records each cut episode in the bible. Characters lock their appearance *and* their voice once they
have been in a video (`APPEARANCE_LOCKED`, `VOICE_LOCKED`, enforced in the reducers the server runs and refused with
HTTP 423). Audio is authoritative: speaking shots are recorded first in the character's canonical voice (Habibi-TTS
IRQ for Iraqi Arabic, IndexTTS 2.5 otherwise), verified by transcription, anchored in the MiniMax H3 request, and the
finished take is transcribed back and rejected if it does not say its lines; a music video's mix carries the song
master once with every take's own singing muted.

**The engines.** MiniMax H3 (open weights, ComfyUI 0.38.1, int8, turbo LoRAs) is the only video engine; Qwen-Image /
Qwen-Image-Edit for pictures; ACE-Step 1.5 and MiniMax Music 3 for songs; IndexTTS 2.5 and Habibi-TTS IRQ for
voices; faster-whisper large-v3 and Demucs for transcription and stems; qwen3:14b (Ollama) as the story model; ffmpeg
for the sample-exact assembly, loudness and validation. No hosted MiniMax key exists on this machine, so the hosted
paths are implemented and tested against the real endpoint's refusals but have never produced media here.

## 2. Acceptance productions (through the real browser)

| | Acceptance A — "The Lamp Shop" | Acceptance B — "بيت أبو كريم" |
|---|---|---|
| Kind, language | Short, English, cartoon, 1:00 | Show (manual brief), Arabic — Iraqi Baghdadi, cartoon, 2:00 episodes |
| Story / script | develop 53 s → 2 scenes at one place (morning, dusk); 15 lines | develop 24 s → 3 scenes; 18 Iraqi lines with English gloss |
| Cast & world | 2 portraits, 2×5 reference views, plates (master, 2 views, dusk); voices built, proof lines WER 0 | 2 portraits, sheets, plates; Iraqi voices from Arabic reference clips, proof lines WER 0.13 / 0.14 |
| Shot plan | 10 shots / 60 s, 15 lines assigned once; shot 1.2 set to CONTINUATION | 15 shots / 120 s, 18 lines assigned once, 4 continuations — after 3 failed attempts (tool timeout under GPU contention, then an invalid answer), fixed and retried with the change recorded |
| Gate | story approved on the Produce tab | story approved on the Produce tab |
| Takes | 10/10 generated, 0 failed jobs, 37.9 min; 8 accepted at once, 2 rejected by a measurement bug (typographic apostrophe), fixed, re-recorded in 5.7 min, both at coverage 1.0 | in progress at the time of writing |
| Cut, gate, export | cut 28 s, −23.0 LUFS, one sound per stretch; cut approved on the Final Cut tab; export 1080p H.264 64.2 s, validation 8/8 | pending |
| Continuity | same two characters and the same shop across both scenes (`docs/evidence/lamp-shop-export-contact-sheet.png`); shot 1.2 opens on shot 1.1's last frames | pending: Continuity Writer → Auto episode 2 → Auto season 2 |

Evidence: `docs/evidence/lamp-shop-*.png`, `company-*.png`, `studio-*.png`; the handoffs, QA reports, approvals,
agent runs and events of both productions are in the database and on the Studio Company pages.

## 3. The Studio Company interface

`docs/evidence/company-studio.png` (desktop), `company-phone-studio.png` (phone), `company-ar-*.png` (Arabic, RTL),
`company-studio-departments-VIDEO.png`, `company-studio-agents-minimax-video-specialist.png`.

- The orchestrator at the centre reads *Coordinating* while the story model plans, *Producing* while the GPU
  generates, *Awaiting review* when a story or a cut waits for a decision, *Blocked* on a refused handoff, *Ready*
  or *Idle* otherwise. Selecting it lists the productions in flight with their pipeline progress, the departments at
  work, the decisions waiting, the blockers and the recent decisions.
- A department node lights teal only while one of its agents has a run open; the Executive Office turns gold while
  a decision waits; connections follow the pipeline and light from recorded handoffs; selecting one shows the latest
  handoff artifact with its checks. Nodes are links (keyboard: Tab, Enter); hover and focus show the responsibility
  and the director. Below the large breakpoint the ring becomes a column in production order.
- Department pages: director first, agents as profile cards, models, verified tools and skills, active assignments,
  deliverables with their checks, quality results, activity. Agent pages: current assignment and execution state,
  instructions, runs with tool calls and timings, failure history, quality requirements, tools, skills with the
  SKILL.md text.

## 4. Reliability (from the records at the time of writing)

| Measure | Value |
|---|---|
| First-attempt technical success (all agents, 7 days) | 59 / 60 runs (98 %) — the one failure: the three PLAN_SHOTS attempts of B counted as one job |
| First-attempt creative acceptance (takes whose first inspection accepted them) | 12 / 12 of A's takes (after the apostrophe fix; before it, 10 / 12) |
| Retry rate | 2 / 29 jobs (A's two re-takes are new jobs, not retries; B's plan is the retried job) |
| MiniMax H3 engine time | 122–356 s per 5–9 s take at 1344×768 (median 7.8 min including the recording of the lines and the inspection) |
| Cut / export | 28 s / 29 s for a 64 s film |
| Export validation | 1 / 1 passed |
| Reliability events | 3 (PLAN_SHOTS: 2 × INFRASTRUCTURE timeouts, 1 × PROVIDER invalid answer), all resolved by attempt 4 with the change recorded |

## 5. Limitations and blockers

- **No MiniMax API key**: the hosted video, speech and music paths are implemented and refused correctly by the real
  endpoint with a wrong key, but no hosted generation has run here. The two hosted MiniMax skills are registered as
  "needs a MiniMax API key" and assigned to no agent as a live capability.
- **Subjective quality is a person's call.** Dialect authenticity of the Iraqi voices, acting, and frame-level
  lip-sync are marked *pending review*; the machine proves intelligibility (transcription), timing (envelope lag) and
  integrity (validation), not taste.
- **The QA inspectors run inside the producing job.** Their reports are separate records with their own thresholds,
  but the inspection code executes in the take/cut job, not in a second process; the Character Consistency, World
  Continuity and Lip-Sync inspectors still rely on a human review (no vision model is wired).
- **The story model's quality**: qwen3:14b occasionally invents a character it does not use (now dropped), writes
  mixed-script Arabic titles, and needs lenient parsing; a hosted LLM would do better and is one env variable away.
- **GPU contention**: the 14B story model and ComfyUI share the card; planning under an image or video batch is slow
  (the story tool now allows 10 minutes) and a video batch should not be started while the model is loaded.
- **Agents' names and instructions are English** in the Arabic interface; department names are bilingual.

## 6. How to run it

`docs/SETUP.md` (install, env, first start), `docs/OPERATIONS.md` (services, the organisation, gates, failure classes,
start/stop/migrate/recover, GPU), `docs/PRODUCTION.md` (producing with it), `docs/STUDIO-ARCHITECTURE.md` (the ADR
and the as-built architecture), `docs/MODELS.md` (weights and licences), `docs/AUDIOVISUAL-QA.md` (the audio and
lip-sync experiments and measurements), `docs/research/PRODUCT-DESIGN.md` (the design references and what was taken).
