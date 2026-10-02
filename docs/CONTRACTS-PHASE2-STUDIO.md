# Contract — Phase 2: a real Studio Company (draft, 2026-10-02)

Directive: "Phased rebuild", Phase 2. "Each department must have a dedicated page with its director, specialized
agents, responsibilities, assigned tools, verified skills, model configuration and real activity. Each agent must have
a working backend identity, typed tool contracts and explicit execution responsibilities. Do not create decorative
agent profiles or simulated activity."

## 1. What the audit found (main at `352a621`, `src/server/org/model.ts` ORG_VERSION 4)

- 51 agents. 19 own job types (an agent run per job). 4 more are named in code as reporters (audio-sync,
  visual-quality and technical-media inspectors write QA reports; the reliability engineer writes retry events).
- **28 agents have no code path that ever executes them** — e.g. props-designer, set-designer, world-continuity,
  colorist, continuity-editor, motion-director, performance-director, cinematographer, sound-director,
  voice-engineer, world-continuity-inspector, lipsync-inspector, story-editor, creative-research, the four
  "rule set" directors. Their profile pages say "its rules run inside the department's jobs and its decisions are
  recorded as events" — **untrue**: nothing records them. These are decorative and must go or become real.
- Tools carry schema *names* (`inputSchema: 'ImageGenerateInput'`) that exist nowhere in code; `ctx.tool(id, fn)`
  enforces the allow-list and the timeout but validates nothing. `studio.read` and `studio.command` are assigned to
  many agents and have **zero call sites**.

## 2. Rules

1. **Execution-path rule.** An agent appears in the company only if code executes it, in one of two ways:
   - it **owns job types** (the worker opens its agent run per job — existing), or
   - it performs a **delegated step** inside another agent's job: `ctx.delegate(agentId, purpose, fn)` opens a child
     agent run (`parent_run_id`), gives `fn` a tool runner with *that* agent's allow-list, records its tool calls,
     outcome and duration, and closes it. Only for steps that genuinely exist as separate code (a check, a
     validation, a selection, a normalisation) — never a wrapper around nothing.
   Anything else is removed from the roster (a "planned roles" list may live in docs, not on the company pages).
2. **Directors are real.** Each department's director is either the owner of the department's orchestration job, or
   performs the department's **handoff review**: the existing `recordHandoff` validation checks run as the director's
   delegated step (pass/fail recorded under the director).
3. **Typed tool contracts.** Every tool has a zod input and output schema in `src/server/org/contracts.ts`;
   `ctx.tool(id, fn, { input })` validates the input (when given) before the call and the output after it — a
   mismatch fails with `WRONG_PARAMETERS` (input) or `OUTPUT_CORRUPTION` (output) and is recorded on the run. The org
   API exposes each contract as JSON Schema (`z.toJSONSchema`) and the agent page shows it. A tool with no call site
   is removed or wired (e.g. `studio.command` wraps the handlers' `command()` writes).
4. **Agent identity** = id, department, role, responsibility sentence, model actually used, owned job types and
   delegated steps (by name), allow-listed tools (contracts), skills (verified / unavailable), limits, version —
   all from code, synced to the DB on boot; the profile shows only recorded activity.
5. **Honesty in copy.** No profile text may claim activity the code does not record.

## 3. Proposed roster (to confirm against the research reports)

| Department | Director (how real) | Agents with an execution path |
|---|---|---|
| Executive Office | Production Coordinator — `PRODUCE` | Executive Producer — delegated *feasibility preflight* (`preflightTake/Plan/Character`); Quality Director — delegated *gate check* (`requireApproval`) |
| Story Development | Head of Story — `DEVELOP_STORY`, `AUTO_IDEA` | Screenwriter — `WRITE_SCRIPT`; Continuity Writer — `EPISODE_CONTINUITY` |
| Casting & Character Design | Casting Director — `CREATE_CHARACTER`, `DESIGN_CHARACTER` | Character Designer — `CHARACTER_APPEARANCE`, `CHARACTER_REFS`; Voice Casting — `VOICE_BUILD`; Character Continuity — delegated *identity check* of each drawn view and *reference hand-off* to shots |
| World Building & Art Direction | Art Director — delegated *handoff review* of plates | Environment Artist — `LOCATION_PLATES` |
| Pre-Production | Film Director — `PLAN_SHOTS` | Storyboard Artist — `SHOT_FRAMES`; Shot Planner — delegated *duration fitting* (`shotWindows`/fit) |
| Video Production | MiniMax Video Specialist — `GENERATE_TAKE` | Reference Conditioning — delegated *reference selection* for a take |
| Sound & Music | Dialogue Director — `DIALOGUE_AUDIO`, `VOICE_PREVIEW` | Music Director — `GENERATE_SONG`; Singing Performance — `PLAN_SHOTS performanceOnly`; Iraqi Dialect Specialist — delegated *line preparation* (`normalizeIraqi`, `routeLine`); Audio Engineer — delegated *mix plan* |
| Post-Production | Video Editor — `ASSEMBLE` | Export Engineer — `EXPORT`; Subtitle Specialist — delegated *subtitle build* |
| Quality Assurance | Quality Director (or a QA lead) | Technical Media Inspector — `MEDIA_PROBE` + reports; Audio-Sync Inspector — reports; Visual Quality Inspector — reports; Reliability Engineer — retry records |

Removed from the company pages (no code): props-designer, set-designer, world-continuity, world-designer (part of
Head of Story's develop call), colorist, continuity-editor, audio-mixing-engineer (merged into Audio Engineer),
motion-director, performance-director, production-director, rendering-engineer, cinematographer, production-planner,
sound-director, voice-engineer, post-director, studio-director, creative-research, story-editor (returns with the
deferred Auto Idea), lipsync-inspector, character-consistency-inspector (returns when an automatic identity check
exists — see `docs/research/CHARACTER-IMAGE-V2.md`), world-continuity-inspector.

## 4. Interface

Studio Company page, department page and agent profile follow `docs/DESIGN-SYSTEM-V3.md` (being written): the
orchestrator constellation with connections from recorded handoffs only; department page = director, agents,
responsibilities (owned jobs + delegated steps), tools with their contracts, skills with status, models, real
activity; agent profile = identity, contracts, responsibilities, runs (including delegated runs), failures. Tested in
the real browser (desktop, phone, Arabic) before Phase 3.
