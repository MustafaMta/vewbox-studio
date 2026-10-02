# Contract — Phase 2: a real Studio Company (v1, 2026-10-03)

Directive (phased rebuild, Phase 2, and the producer's follow-up of 2026-10-03): "Every agent displayed in the Studio
Company must have a real execution path, genuine tools and verified skills. Remove or clearly identify agents that
are not yet implemented. Do not display fabricated capabilities or activity." Each department page shows its
director, specialized agents, responsibilities, assigned tools, verified skills, model configuration and real
activity; each agent has a working backend identity, typed tool contracts and explicit execution responsibilities.

## 1. Audit (main at `16555b1`, ORG_VERSION 4)

- 51 agents. 23 have an execution path (they own job types, or `agentIdForJob` routes a payload to them —
  singing-performance), plus 4 named as reporters in code (three QA inspectors write QA reports; the reliability
  engineer's retry events are written by the retry route). **28 agents are executed by nothing**, and their pages
  claim "its rules run inside the department's jobs and its decisions are recorded as events" — untrue.
- Tools carry schema *names* that exist nowhere; `ctx.tool(id, fn)` checks the allow-list and timeout and validates
  nothing. `studio.read` and `studio.command` are on many allow-lists and have **zero call sites**.
- Skills: `syncOrg` copies each SKILL.md into the database for display; **no agent ever reads one at run time**, and
  `status: 'VALIDATED'` is a hand-written flag with no evidence behind it.
- Directors: Executive (studio-director), Video (production-director), Sound (sound-director), Post (post-director)
  and World (art-director) are "rule set" agents that never run.

## 2. Rules

**R1 — Execution path.** An agent is on the company pages only if code executes it:
- (a) it owns job types (`JOB_AGENT` / `agentIdForJob`; the worker opens its run per job), or
- (b) it performs a **delegated step**: `step(ctx, agentId, purpose, fn)` (`src/worker/handlers/index.ts`, built on
  `makeDelegator` in `src/server/org/tools.ts`) opens a child agent run (`agent_runs.parent_run_id`, `purpose`), hands
  `fn` a tool runner with that agent's allow-list, records tool calls, outcome, failure class and an activity event.
  A delegated step wraps code that genuinely exists as its own piece of work (a validation, a selection, a plan, a
  classification) — never an empty wrapper.
Each agent declares its responsibilities in code: `jobTypes` and `steps: Array<{ id, name, where }>` (where = the
handler that calls it). A test asserts every `steps[].id` is actually invoked by `step(…)` in `src/worker/**` (static
scan), and every agent has ≥1 job type or step.

**R2 — Not yet implemented roles are clearly identified, not staffed.** `PLANNED_ROLES` in model.ts: department,
name, what it would do, why it is not implemented (e.g. "needs a vision model"), the phase it belongs to. Shown on the
department page in a separate, visibly muted "Not yet staffed" list: no profile page, no tools, no skills, no model,
no activity, no status dot.

**R3 — Directors are real.** Every department's director satisfies R1. Where no orchestration job exists, the
director performs the department's **handoff review**: the validation checks passed to `recordHandoff` are computed
inside the director's delegated step.

**R4 — Typed tool contracts.** `src/server/org/contracts.ts`: a zod input schema and output schema for every
registered tool. `ctx.tool(id, fn, { input })` validates the input (when given) before the call → `WRONG_PARAMETERS`
on mismatch; validates the output after the call → `OUTPUT_CORRUPTION` on mismatch; both recorded on the run's tool
call. Schemas describe what the call sites really pass and return (read every call site; prefer precise fields and
`.passthrough()` over `z.any()`). The org API exposes each contract as JSON Schema (`z.toJSONSchema`). Tools with no
call site are removed from the registry and every allow-list. An agent's allow-list contains only tools its code
paths call (test: static scan of `ctx.tool('…')` / `tool('…')` within its handlers and steps).

**R5 — Verified skills.** A skill is either
- **PROMPT** — its SKILL.md body is injected into the system prompt of the LLM calls of the agents that list it
  (`skillPrompt(agentId)` loader used by the story engine); verified when a test asserts the injection, or
- **PROCEDURE** — the procedure it describes is implemented by named code (`implementedBy: string[]` file paths) and
  checked by named tests (`verifiedBy: string[]`).
Status is computed at sync, never hand-written: `VERIFIED` (SKILL.md present + implementation/injection present +
tests present), `UNAVAILABLE` (needs something this machine lacks — e.g. a MiniMax key; the reason shown),
`DRAFT` (anything missing — the reason shown). The pages show how a skill is used and its evidence. External skills
(MiniMax-AI/skills) stay read-only knowledge: never executed, no shell, no credentials.

**R6 — Identity from code, activity from records.** Agent identity (id, department, role, responsibility sentence,
model actually used, jobTypes, steps, tools with contracts, skills with status, limits, version) is code synced on
boot; `syncOrg` deletes agents, tools and skills that are no longer in code (their past runs keep their ids). Pages
show only recorded activity; profile copy never claims unrecorded work.

## 3. Roster (ORG_VERSION 5)

| Department | Director (execution path) | Agents (execution path) |
|---|---|---|
| Executive Office | **Executive Producer** — steps *feasibility preflight* (`preflightTake` in take.ts, `preflightPlan` in story.ts planShots, `preflightCharacter` in character.ts) | **Production Coordinator** — `PRODUCE` |
| Story Development | **Head of Story** — `DEVELOP_STORY`, `AUTO_IDEA` | **Screenwriter** — `WRITE_SCRIPT`; **Continuity Writer** — `EPISODE_CONTINUITY` |
| Casting & Character Design | **Casting Director** — `CREATE_CHARACTER`, `DESIGN_CHARACTER` | **Character Designer** — `CHARACTER_APPEARANCE`, `CHARACTER_REFS`; **Voice Casting** — `VOICE_BUILD`, `VOICE_PREVIEW` (moved from the Dialogue Director: previewing a character's voice is casting); **Character Continuity** — steps *reference-picture check* (validation of an uploaded reference before drawing) and *identity hand-off* (reference set for a shot in take.ts) |
| World Building & Art Direction | **Art Director** — step *plate handoff review* (the CAST_WORLD handoff checks of `LOCATION_PLATES`) | **Environment Artist** — `LOCATION_PLATES` |
| Pre-Production | **Film Director** — `PLAN_SHOTS` | **Storyboard Artist** — `SHOT_FRAMES`; **Shot Planner** — step *timing fit* (`shotWindows` / duration fitting in planShots) |
| Video Production | **MiniMax Video Specialist** — `GENERATE_TAKE` | **Reference Conditioning** — step *reference selection* for a take (take.ts) |
| Sound & Music | **Dialogue Director** — `DIALOGUE_AUDIO` | **Music Director** — `GENERATE_SONG`; **Singing Performance** — `PLAN_SHOTS performanceOnly`; **Iraqi Dialect Specialist** — step *line preparation* (`normalizeIraqi` + `routeLine` before synthesis); **Audio Engineer** — step *mix plan* (assemble.ts) |
| Post-Production | **Video Editor** — `ASSEMBLE` | **Export Engineer** — `EXPORT`; **Subtitle Specialist** — step *subtitle cues* (assemble.ts) |
| Quality Assurance | **Quality Director** (moves from Executive to QA) — steps *approval gate* (`requireApproval` in produce.ts and assemble.ts export) | **Technical Media Inspector** — `MEDIA_PROBE` + step *file validation* (`validateExport`); **Audio-Sync Inspector** — step *speech/lag check* (take.ts, voice.ts, music.ts QA reports); **Visual Quality Inspector** — step *picture check* (take.ts QA); **Reliability Engineer** — step *failure classification* (worker `classifyFailure` + `reliabilityEvent`) |

**Planned roles (R2, not staffed):** Studio Director (creative direction is the producer's, through the approval
gates), Creative Research and Story Editor (return with the research-driven Auto Idea, branch
`deferred/auto-idea-research`), World Designer (part of Head of Story's develop call today), Set Designer, Props
Designer, World Continuity, Cinematographer (inside the Film Director's shot plan today), Production Planner (part of
the Executive Producer's preflight), Production Director, Motion Director, Performance Director, Rendering Engineer,
Sound Director, Voice Engineer, Post-Production Director, Continuity Editor, Audio Mixing Engineer (merged into the
Audio Engineer), Colorist, Character Consistency Inspector and World Continuity Inspector (need an automatic identity
/ environment check — see `docs/research/CHARACTER-IMAGE-V2.md`), Lip-Sync Inspector (needs a measured lip-sync
check).

Removed tools: `studio.read`, `studio.command` (no call sites). New skills for this phase's scope:
`character-design` (PROMPT for the Casting Director's design call + PROCEDURE for the identity sheet) and
`voice-identity` (PROCEDURE: reference rule, proof line, routing, lock) — written from what the code actually does.

## 4. API and pages (inputs to the UI work)

`GET /api/studio/org` returns per agent: identity, `jobTypes`, `steps`, tools with `contract: { input, output }` (JSON
Schema), skills with `{ status, kind, evidence }`; per department: director, agents, `plannedRoles`. Agent runs carry
`parentRunId` and `purpose`; the agent page lists delegated runs as its own work. The Studio Company UI is built on
this after `docs/DESIGN-SYSTEM-V3.md`.

## 5. Ownership while the wave-2 fixer is still working

The fixer owns `src/worker/handlers/{character,voice,images}.ts`. The Phase 2 backend engineer implements everything
else (model, registry, contracts, runner validation, skills loader, API, steps in take.ts, story.ts, produce.ts,
assemble.ts, music.ts, worker/index.ts) and lists the steps still to wire in character.ts / voice.ts / images.ts;
those are wired after the fixer's branch merges.
