# The studio architecture — decision record

Date: 2026-10-02. Scope: the restructuring of Vewbox Studio into a department-based, multi-agent film studio
(directive "Rebuild the application as a professional multi-agent AI film studio").

## 1. What was researched

| Candidate | What it is (verified) | Fit |
|---|---|---|
| LangGraph (Python; `@langchain/langgraph` for JS/TS at parity), MIT | typed state graph: nodes, edges, reducers; checkpointers (Postgres) for durable execution; interrupts for human-in-the-loop; subgraphs; streaming. Provides no job queue, no GPU scheduling. | the concepts fit exactly (typed state, durable steps, interrupts); the library would sit on top of a Postgres job queue that already does durable steps, leases, retries and restart recovery — two orchestration systems for one job |
| CrewAI (Python only), MIT | Agent (role/goal/backstory), Task, Crew, Process (sequential / hierarchical manager), Flows with decorators; delegation; tools | Python; no persistence layer; typed handoffs and observability only in the paid suite; the "backstory prompt" model is the generic-agent pattern the directive forbids |
| Microsoft AutoGen | in maintenance mode, community-managed; Microsoft points new users to the Agent Framework | ruled out |
| Microsoft Agent Framework (Python, .NET, Go), MIT | agents + graph workflows (sequential, concurrent, handoff, group), checkpointing, human-in-the-loop, middleware | no TypeScript SDK; the application is TypeScript end to end |
| Anthropic Agent Skills (`SKILL.md`: `name`, `description`, optional `license`, `allowed-tools`, `metadata`; `scripts/`, `references/`, `assets/`; progressive disclosure) | a file format for packaged instructions, not a runtime | adopted as the skills format: every skill in this studio is a folder with a `SKILL.md` and references, versioned with its source |
| MiniMax-AI/skills (multimodal toolkit, music-gen, vision-analysis, frontend/fullstack dev) and `mmx-cli` | wrappers around the **hosted** MiniMax API (video, speech, music, image, vision); Claude Code installation via plugin marketplace; no local models | registered as skills with status "needs a MiniMax API key"; this machine has none, so they cannot be validated here and are not assigned as live capabilities |
| MinimaxStoryBuilder (MIT, ComfyUI node pack) | cast → outline → stage pipeline, 15 s clips, character sheets and location plates re-sent on every shot, voice samples as `<Audio j>` timbre references, six-part H3 prompt grammar, hard cuts between shots (continuity guide mode retired) | its three-pass planning, the "references on every shot" rule and the prompt grammar are adopted as skills/references; its frame and clip conventions were verified against our ComfyUI 0.38.1 H3 nodes (17k+5 frame grid, 1344×768, res_multistep/simple, shifts 12/3) |
| ComfyUI MiniMax H3 docs (Comfy-Org/docs) | fl2va and ref2va checkpoints (pruned int8 / bf16), turbo LoRAs (8 steps t2v/i2v, 4 steps ref2va), native stereo audio generated with the picture in one pass ("speech and voice timbre converge latest"; 8 steps weakest audio, 12+ recommended), reference-to-video with text/image/video/audio references, int8 attention caveats | sets the production parameters and the QA thresholds (audio quality vs step count) |

## 2. Decision

**A modular monolith in TypeScript with one durable orchestration system — the existing Postgres job queue — and a
code-defined, database-persisted studio organisation.** No second agent framework is installed.

Why:
- The application already has what the frameworks would add: durable job state with leases and restart recovery,
  idempotency keys, bounded retries with backoff, cancellation, a command engine with deterministic ids and a
  state hash, LISTEN/NOTIFY events to the browser, a GPU lease that serialises model families on the 32 GB card.
  Adding LangGraph on top would duplicate durability and split observability across two systems; CrewAI and the
  Microsoft framework are not TypeScript.
- What the frameworks teach is adopted as design: LangGraph's typed state + explicit edges + checkpoints +
  interrupts become the **production pipeline graph** (typed stage state, dependency edges, durable per-stage
  jobs, approval interrupts); the Agent Framework's handoff pattern becomes **handoff artifacts** between
  departments; Anthropic's skill format becomes the **skills registry**.
- Agents are logical workers: a department's agent is a registered identity with a job description, a model, a
  skill set, an allow-list of typed tools, limits and a version; the worker executes a job *as* that agent and
  records the run (tool calls, attempt, outcome, failure class). Departments are not containers.

## 3. The organisation (persisted in `departments`, `agents`, `tools`, `skills`)

Executive Office — Studio Director, Executive Producer, Production Coordinator, Quality Director.

| # | Department | Director | Agents | Owns |
|---|---|---|---|---|
| 1 | Story Development | Head of Story | Creative Research Agent, Screenwriter, Story Editor, Continuity Writer | concept, treatment, script, dialogue; the Story Bible |
| 2 | Casting & Character Design | Casting Director | Character Designer, Voice Casting Agent, Character Continuity Agent | the Character Bible (identity, references, voice, lock) |
| 3 | World Building & Art Direction | Art Director | World Designer, Environment Artist, Set Designer, Props Designer, World Continuity Agent | the World Bible and Location Bible (plates, layout, props, state) |
| 4 | Pre-Production | Film Director | Storyboard Artist, Cinematographer, Shot Planner, Production Planner | the production plan: scenes, shots, frames, durations, audio needs, continuity states |
| 5 | Video Production | Production Director | MiniMax Video Specialist, Reference Conditioning Agent, Motion Director, Performance Director, Rendering Engineer | validated takes with provenance (MiniMax only) |
| 6 | Sound & Music | Sound Director | Dialogue Director, Iraqi Arabic Language Specialist, Voice Engineer, Music Director, Singing Performance Agent, Audio Engineer | the authoritative audio timeline: dialogue, song, stems, mix policies |
| 7 | Post-Production | Post-Production Director | Video Editor, Continuity Editor, Audio Mixing Engineer, Colorist, Subtitle Specialist, Export Engineer | the cut, the mix, subtitles, the validated export |
| 8 | Quality Assurance | Quality Director | Character Consistency Inspector, World Continuity Inspector, Audio Synchronization Inspector, Lip-Sync Inspector, Visual Quality Inspector, Technical Media Inspector, Reliability Engineer | QA reports and the acceptance decision; independent of the producers |

Every agent record carries: id, name, department, role, description, system instructions, assigned model (what
actually runs: `qwen3:14b` via Ollama, MiniMax H3 local in ComfyUI, Qwen-Image, IndexTTS 2.5 / Habibi-TTS IRQ,
faster-whisper, ACE-Step / MiniMax Music 3, ffmpeg, or a deterministic rule set), skills, allowed tools, input and
output schemas, limits (timeout, VRAM family), version, quality requirements. Execution history and metrics are
derived from the persisted agent runs — nothing decorative.

## 4. Tools (typed contracts, enforced per agent)

Each tool is a registered contract: name, description, version, Zod input/output schemas, required permissions,
timeout, resource family (LLM / GPU-IMAGE / GPU-VIDEO / TTS / ASR / CPU), error classes, logging. The worker hands
an agent a `tool(name, input)` that refuses names outside the agent's allow-list, validates input and output, runs
under the GPU lease when the resource family needs it, and records the call on the agent run.

| Tool | Backed by |
|---|---|
| `story.structured_answer` | the local or hosted LLM with lenient schema repair |
| `image.generate`, `image.edit_with_references` | Qwen-Image / Qwen-Image-Edit in ComfyUI |
| `video.minimax_generate` | MiniMax H3 (local ComfyUI graphs fl2va / ref2va with guides; hosted API when a key exists) |
| `speech.synthesize`, `speech.transcribe`, `audio.separate_stems` | IndexTTS / Habibi, faster-whisper, Demucs |
| `music.generate` | ACE-Step 1.5 / MiniMax Music 3 |
| `media.probe`, `media.qa_take`, `media.assemble`, `media.validate_export`, `media.align_lag` | ffmpeg/ffprobe |
| `studio.command`, `studio.read` | the command engine (typed commands) and the snapshot |

## 5. Pipeline graph, handoffs and gates

Story approval → Cast & world → Script → Storyboard → Shot plan → Audio preparation → Video generation → QA →
Edit → Export. Each stage is owned by a department, runs as durable jobs, and ends in a **handoff artifact**
(producer, receiver, production, artifact ids, input/output versions, validation, quality status, remaining
dependencies). A receiving department refuses an invalid handoff. QA writes **QA reports** (subject, inspector,
checks, failure class, decision) and never approves its own department's work. Subjective decisions (acting,
style, dialect) stay with a human **approval**. Independent work runs concurrently; a continuation shot waits for
the shot it continues.

## 6. First-attempt engineering

Preflight validation before any generation (references, model capability, reference limits, audio, duration,
prompt completeness, aspect, resolution, credentials, GPU and storage, continuity, dependencies). Failures are
classified (invalid input, unsupported capability, missing reference, inconsistent plan, prompt ambiguity, wrong
parameters, infrastructure, provider, resource exhaustion, character inconsistency, environment inconsistency,
voice mismatch, lip-sync failure, audio duplication, output corruption) and corrected with a stated change; blind
retries exist only for transient infrastructure failures (bounded, with backoff). Every attempt is accounted; a
second attempt raises a reliability event; the dashboard shows first-attempt technical success, first-attempt
creative acceptance, retry rate, failure classes, cost and latency per accepted shot, QA rejection and export
success rates.

## 7. What stays from the previous build

The Next.js application, the command engine and snapshot, the Postgres schema and migrations, the job queue and
worker, the GPU lease, the providers (ComfyUI, MiniMax, voice, transcription, music), the media toolchain
(assembly with the typed mix plan, validation, lyric alignment, lag alignment), the continuity rule, the Screening
Room design language. They are reorganised under the departments, attributed to agents, and gated by handoffs and
QA — not rewritten for its own sake.
