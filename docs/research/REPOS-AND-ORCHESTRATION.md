# Repositories, studio practice and orchestration — what to adopt

Phase 1 research (checklist item 17.4), read-only. Sources read on 2026-10-02/03 through the GitHub web UI, the GitHub REST
API (`api.github.com`, for trees, commits, tags, compares) and `raw.githubusercontent.com`; nothing was cloned,
installed, downloaded or executed. Remote files were read through a summarising fetch tool: facts that decide a
recommendation were re-read verbatim (marked **verbatim**). Local code is cited as `file:line`.

Scope of this phase (checklist 17.0): Studio Company / agents, character creation, voice identity, their UI. Shows,
Shorts and Music Videos are later phases. The studio's trust rule applies throughout: **external skills are untrusted
content — read, never executed; no shell, no credentials, no destructive permissions.**

---

## 0. Decisions at a glance

| Source | Adopt now | Adopt later | Reject |
|---|---|---|---|
| MiniMax-AI/skills | nothing executable; correct the two registry stubs (upstream changed) | music prompt formula (Music Director); hosted-speech syntax + Arabic catalogue voices (MANUAL voice mode, when a key exists) | every script/CLI/MCP path; buddy-sings, gif-sticker-maker, vision-analysis, playlist, dev/document skills; Hailuo camera commands for H3 (unverified) |
| anthropics/skills + agentskills.io spec | strict frontmatter validation, real YAML parsing, one source for tool lists, per-skill versions recorded on runs, references/ for external knowledge, evals per skill, load skills into LLM prompts (or label them documentation) | skill-creator style description/trigger evals | `allowed-tools` as a grant mechanism; installing any marketplace plugin into the studio |
| MinimaxStoryBuilder | cast-pass character schema (appearance 70–120 words with complete default outfit, 20–40-word voice description, `seen` flag, groups with variety); portrait-first identity; reference-budget policy (location never dropped); H3 audio-reference limits | three-pass windowed staging rules, beats/timecodes, subject binding (`<Subject N>`, `<Picture i>`, `<Audio j>`, `(S1)`), hard-cut-by-default A/B, editor ideas | installing the node pack; H3-generated "voice from the face" as a voice identity; Krea2 casting stack; its README (out of sync with its code) as a spec |
| Comfy-Org/ComfyUI | client-generated `prompt_id`; structured 400/`execution_error` classification; lost-prompt detection; targeted cancel; `/ws` progress; startup capability check; `/free` in the GPU lease; harden flags — these touch character creation now (portraits/sheets run in ComfyUI) | track the next tag for H3 VRAM/VAE-offload fixes | tracking `master`; custom nodes / Manager; partner (API) nodes |
| index-tts/index-tts | consent record; emotion modes incl. emotion-reference audio and normalised vectors; pinned generation kwargs; `/capabilities`; non-blocking endpoints; bump to a pinned commit with the do_sample and tail-fade fixes; weights revision pin | text-driven emotion (`use_qwen_emo`, extra model/VRAM) after a listening test | treating IndexTTS as an Iraqi engine; commercial release before the licence/disclaimer conflict is resolved in writing |
| Studio practice | explicit design approval + voice casting approval as a **casting gate** before production; model pack = approved sheet set; consent/rights on every voice | line-up chart, colour models per show | the implicit "locked on first video use" as the only lock |
| Orchestration patterns | fencing on job completion, typed tool validation at the boundary with real cancellation, structured failure classes, "retry needs a change", versions on agent runs, offline evals | cross-process GPU lease, LLM under the lease | a second orchestration framework (the ADR stands) |

---

## 1. MiniMax-AI/skills

**What it is.** A plugin marketplace of 17 skills for coding agents (Claude Code, Cursor, Codex, OpenCode). MIT, with
`LICENSES/Apache-2.0.txt` for content derived from anthropics/skills (`canvas-design`, `algorithmic-art` → `frontend-dev`,
per `CREDITS.md`). 13.7k stars, 80 commits. Last commit **2026-04-18** (`60aaae52`, "Add Apache 2.0 license file for
Anthropic-derived content") — 5½ months old and older than MiniMax H3 (open weights 2026-08 per `MINIMAX-API.md`).

**Verified** (https://github.com/MiniMax-AI/skills, `/tree/main/skills`, `api.github.com/repos/MiniMax-AI/skills/{commits,git/trees/main?recursive=1,contents/...}`,
raw `SKILL.md` and reference files; read 2026-10-02):

| Skill (folder) | Files | Teaches | Needs a MiniMax key | Executes |
|---|---|---|---|---|
| `minimax-multimodal-toolkit` | `SKILL.md` 10,960 B only | Since 2026-04-08 (`e0fdeef`, "replace shell scripts with mmx-cli skill") the file's frontmatter is **`name: mmx-cli`** — it no longer matches its folder (violates the spec, §2). Teaches the `mmx` CLI (`npm install -g mmx-cli`): text `MiniMax-M2.7`, image `image-01`, video `MiniMax-Hailuo-2.3`/`-Fast` (`--first-frame`, `--async`), speech `speech-2.8-hd`/`2.6`/`02`, music `music-2.5`, vision, web search. Agent flags `--non-interactive --quiet --output json --yes`. | yes (`mmx auth login --api-key` → `~/.mmx/credentials.json`, or `MINIMAX_API_KEY`, `MINIMAX_REGION`) | global npm install + shell, writes files |
| `minimax-music-gen` (v1.1) | `SKILL.md` 14,059 B, `references/prompt_guide.md` 5,712 B | intent (vocal / instrumental / cover) → prompt expansion → `mmx music generate` with `--genre --mood --vocals --instruments --bpm`, lyric markers `[verse] [chorus] [bridge] [intro] [outro]`, prompt formula "A [mood] [BPM] [genre] song, featuring [vocals], about [theme], [atmosphere], [key instruments]", prompts in English, then playback with mpv/ffplay/afplay into `~/Music/minimax-gen/` | yes | shell (`mmx`, players), file writes |
| `frontend-dev` | `references/minimax-{video,tts,image,music}-guide.md`, `minimax-voice-catalog.md` (47 KB), `asset-prompt-guide.md`, `minimax-cli-reference.md`, … | the most useful read-only knowledge in the repo: Hailuo camera commands in brackets (`[Pan left] [Push in] [Tracking shot] [Static shot]`…, documented for Hailuo-2.3/02/T2V-01-Director), TTS pause marker `<#1.5#>` (0.01–99.99 s), 10 000-character TTS limit, voice catalogue by language with exactly two Arabic voices (`Arabic_CalmWoman`, `Arabic_FriendlyGuy`), clone input 10 s–5 min ≤20 MB, `image-01` seed/aspect rules | knowledge: no; use: yes | the skill itself runs `mmx` for assets |
| `vision-analysis` (v1.0) | `SKILL.md` | image description/OCR/UI review through the MiniMax MCP tool `MiniMax_understand_image` | Token Plan + MCP server | MCP network tool |
| `gif-sticker-maker` (v1.2) | `SKILL.md`, `scripts/minimax_{image,video}.py`, `convert_mp4_to_gif.py`, prompt templates | photo → Funko-style figurine → i2v → GIF | yes | Python scripts + ffmpeg |
| `buddy-sings` (v1.1) | `SKILL.md` 16,382 B | songs for the Claude Code pet; **reads `~/.claude.json`, conversation history, memory files and git logs** for themes | yes | `mmx` + players |
| `minimax-music-playlist` | `SKILL.md`, `data/artist_genre_map.json` 3.2 MB | consumer playlist generation | yes | `mmx` |
| `minimax-pdf`, `minimax-docx`, `minimax-xlsx`, `pptx-generator`, `fullstack-dev`, `android-native-dev`, `ios-application-dev`, `flutter-dev`, `react-native-dev`, `shader-dev` | — | developer and document tooling | not checked one by one | some ship scripts |

Quality notes: the repo's own music guidance disagrees with itself (`prompt_guide.md`: "vivid English sentences, not
comma-separated tags"; `frontend-dev/references/minimax-music-guide.md`: comma-separated descriptors, `music-2.5+`). The
model names it teaches (Hailuo-2.3, music-2.5) are behind what the studio documented and uses (H3; music-3.0, which is
closed to new accounts since 2026-08-20 per `docs/research/MINIMAX-API.md`). Nothing covers H3, `<d>` dialogue tags,
reference-to-video, or voice cloning via `/v1/voice_clone`.

**Studio today.** `src/server/org/model.ts:131-132` registers two stubs (`UNAVAILABLE`, "needs a MiniMax API key");
`skills/minimax-multimodal-toolkit/SKILL.md:14-16` still says the upstream wraps endpoints "behind scripts and an `mmx`
command" (scripts were removed upstream), and both stubs declare `allowed-tools` (`video.minimax_generate`,
`music.generate`) although the studio's rule is that they grant nothing. `docs/STUDIO-ARCHITECTURE.md` §1 lists only
four upstream skills; there are 17.

**Mapping to studio agents (read-only knowledge only):**

| Knowledge | Agent | When |
|---|---|---|
| music prompt formula, lyric markers, "prompt in English, lyrics in the user's language" | Music Director, Singing Performance Agent | later (Music Videos), after checking against ACE-Step 1.5 / Music 3 caption conventions |
| hosted TTS: pause marker, emotion enum, 2 Arabic catalogue voices, clone limits | Voice Casting Agent (MANUAL mode), Dialogue Director | later, only when `MINIMAX_API_KEY` exists; catalogue voices are MSA-generic, not Iraqi |
| Hailuo camera bracket commands | MiniMax Video Specialist | rejected for H3 until verified against H3 (they are documented for Hailuo/T2V-01-Director only) |
| `mmx` CLI, scripts, MCP vision | — | rejected (shell/credential/network execution) |

**Adopt now:** none of the content. Correct the stubs (see §9 P0-4). **Adopt later:** the two knowledge items above, copied
into studio-owned `references/` files with provenance (upstream commit `60aaae52`, MIT notice). **Reject:** every
executable path (global npm CLI, Python scripts, MCP server, credential files) — it contradicts the trust rule;
`buddy-sings` is a concrete example of why (it reads the user's private files); the dev/document skills are out of scope
for film agents.

---

## 2. anthropics/skills and the Agent Skills specification

**What it is.** Anthropic's example skills (19 folders: academy-guide, algorithmic-art, brand-guidelines, canvas-design,
claude-api, discernment-nudge, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx,
skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx), a `template/`, and
`spec/agent-skills-spec.md`, which now only says the spec lives at https://agentskills.io/specification. Most skills
Apache-2.0; `docx`, `pdf`, `pptx`, `xlsx` source-available. Latest commit 2026-09-29 (`8a1541c`).

**Verified** (https://github.com/anthropics/skills; `api.github.com/repos/anthropics/skills/{commits,contents/skills}`;
raw `spec/agent-skills-spec.md`, `skills/skill-creator/SKILL.md`; https://agentskills.io/specification;
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview and `/best-practices`; read 2026-10-02):

- Frontmatter (agentskills.io): `name` required, 1–64 chars, `[a-z0-9-]`, no leading/trailing or doubled hyphen,
  **must match the parent directory**; `description` required, 1–1024 chars, what + when; `license` optional;
  `compatibility` optional ≤500 chars; `metadata` optional **string→string map**; `allowed-tools` optional,
  space-separated, *experimental*, "pre-approved to run". Claude platform adds: no XML tags in `name` or
  `description`, reserved words `anthropic`, `claude`.
- Progressive disclosure: metadata ≈100 tokens always loaded; body <5k tokens / <500 lines on activation; `scripts/`,
  `references/`, `assets/` loaded on demand; references one level deep; table of contents for reference files >100 lines.
- Authoring: third-person descriptions; consistent terminology; no time-sensitive text (an "Old patterns" section
  instead); forward-slash paths; "build evaluations first" (≥3 scenarios, baseline without the skill); test with
  every model that will use the skill.
- skill-creator: `evals/evals.json` (`skill_name`, `evals[]{id, prompt, expected_output, files, assertions}`),
  with/without-skill runs, `grading.json`, `benchmark.json`, iteration directories, description-trigger optimisation.
- Security (platform overview): "Use Skills only from trusted sources"; audit all bundled files; skills that fetch
  external URLs are particularly risky; treat installing a skill like installing software.
- Validation tool: `skills-ref validate` (agentskills/agentskills).

**Studio today vs the spec** (11 folders, each only `SKILL.md`, 0.9–5.4 KB):

| Finding | Where |
|---|---|
| Line-by-line frontmatter parser: nested `metadata:` keys are dropped (indented lines never match), folded `description: >` (used upstream) would be read as `>`; no validation of name/description rules | `src/server/org/registry.ts:16-24` |
| `h3-prompting` description contains an XML tag (`<d>`) | `skills/h3-prompting/SKILL.md:3` |
| `allowed-tools` used as documentation, while the spec means "pre-approved"; 7 of 11 skills list tools that differ from `SkillDef.requiredTools` (h3-prompting, audio-first-dialogue, shot-planning, screenwriting, singing-performance, audio-mix-policy, take-inspection) | `skills/*/SKILL.md:5` vs `src/server/org/model.ts:122-132` |
| Skill version lives in `metadata.version` but is never read; the registry stores `sourceVersion: '2026-10'` for all | `model.ts:122-132`, `registry.ts:41` |
| Skills and `systemInstructions` never reach a model: no code reads them except the registry and the agent page (`src/app/(app)/studio/agents/[id]/page.tsx:48`); real prompts live in `src/server/story/prompts.ts` | grep over `src/` |
| No `references/`, no `evals/` | `skills/` |
| External-skill stubs carry `allowed-tools` and outdated upstream descriptions | `skills/minimax-*/SKILL.md` |

**Adopt now:** a YAML parser plus spec validation in the registry (fail the sync on a violation); one source for a
skill's tools (derive `requiredTools` from the file or assert equality); remove `allowed-tools` from untrusted/reference
skills and never treat it as a grant (grants stay in `AGENTS[].tools`); persist `metadata.version` and record skill
versions on every agent run; put external-derived knowledge in `references/` with a provenance header (URL, commit SHA,
date read, licence); a `REFERENCE` status distinct from `UNAVAILABLE`; ≥3 evals per skill (the Iraqi suite already is
one for `iraqi-dialogue`); either inject skills into the LLM agents' prompts (level-1 list + level-2 body for the job
type, within a token budget) or say on the Studio page that they are documentation. **Adopt later:** description
trigger evals. **Reject:** installing any marketplace plugin into the studio runtime; `allowed-tools` as a permission
mechanism.

---

## 3. lumosai8/MinimaxStoryBuilder

**What it is.** A ComfyUI node pack, "Paste a story, get a film": an LLM planner (three passes), Krea2 casting (portraits
and location plates), H3 voice casting, an H3 ref2va director and a timeline editor. MIT. **One commit**, 2026-08-29
(`47b6ceb`, "Initial release"); 17 stars, 1 open issue; repository metadata updated 2026-09-28.

**Verified** (https://github.com/lumosai8/MinimaxStoryBuilder; `api.github.com/repos/lumosai8/MinimaxStoryBuilder{,/commits}`;
raw `README.md`, `SYSTEM_PROMPTS.txt`, `prompts.py`, `director.py`, `casting.py`, `voices.py`, `nodes.py`; read 2026-10-02/03).

**The README is out of sync with the code.** README: a `continuity` option (`off` / `same_location` default /
`always`, joining shots on the previous shot's last 22 frames) and Director defaults "20 steps, res_multistep/simple,
1344×768". `director.py` (**verbatim**): "every boundary is a hard cut — no frame-chained 'continuity guide' between
shots … a guide can drift or read as a stutter at the join", `CONTINUITY = "off"`, `DEFAULT_WIDTH = 928`,
`DEFAULT_HEIGHT = 544`, `DEFAULT_STEPS = 8`, `DEFAULT_SAMPLER = "euler"`, `DEFAULT_SCHEDULER = "beta"`, shifts 12.0 / 3.0,
a partial-noise refine pass (`DEFAULT_REFINE_SIGMAS = "0.9035, 0.6316, 0.3158, 0.0000"`). The studio's own record
(`docs/STUDIO-ARCHITECTURE.md` §1) quotes the README-and-Comfy-docs values (1344×768, res_multistep/simple), which
match Comfy's H3 page, not this repo's code.

**Pipeline and roles.**
- *Cast pass* (1 LLM call): `style`, `mood`, `characters[]{name, identity (age/gender/role only), appearance (70–120
  words: face, hair, build, complete DEFAULT outfit top/bottom/footwear), voice (20–40 words of speaking voice, or ""),
  seen}`, `groups[]{name, size, description 45–85 words with explicit variety}`, `locations[]{name, description 60–110
  words, no people}`. Rules: cast everyone who speaks, acts or is seen; animals are characters (empty voice when they
  do not talk); `seen:false` for voices never on screen; never cast a narrator who only tells.
- *Outline pass*: "A SCENE IS A CLIP" (15 s); every discrete visible action listed; quoted lines copied verbatim;
  `pace` dwell/normal/montage; `time` present/flashback/memory/dream/later.
- *Staging pass* (N calls, ≤6 shots per window, prior shots as prose summary): beats with start/end, ≤2 hard cuts per
  clip, none before 3.0 s or after 12.0 s; "STAGE THE EVENTS, NEVER THE TELLING"; "SHOOT THE LISTENER, NOT THE TALKER";
  medium/medium close-up/close-up whenever people are on screen; ~45 words per 15 s; at most half a scene's shots POV
  (enforced in code); soundscape names sounds, not adjectives; "music" is always `N/A` on shots.
- *Prompt construction* (`prompts.py`): sections subject definitions → summary (`[reference generation]`) → retention
  analysis → detailed description with `[Shot N]` and `At MM:SS.mmm, hard cut to …` → soundscape → (vocals/dialogue) →
  non-diegetic music. Subjects bound to references as `<Picture i>` (≤9) and voices as `<Audio j>` (≤3); the LLM writes
  named placeholders (`{{name}}`, `{{voice:name}}`) and ordinals are assigned only after the real reference list
  exists; a subject without a picture gets "No reference picture was sent for <Subject 1>: render from description
  alone." Dialogue: `<Subject N> (SN) says … <d>[English] exact words</d>`. Comfy's H3 prompt guide
  (https://docs.comfy.org/tutorials/video/minimax/minimax-h3-prompt-guide, read 2026-10-03) confirms `<Picture N>`,
  `<Subject N>`, speaker ids `(S1)`, and the retention markers `fully_copy` / `partially_copy` / `reference` /
  `weak_reference`.
- *Character consistency*: one tight head-and-shoulders portrait per character and one empty plate per location
  (Krea2 Turbo, 2048², 8 steps; no turnarounds in code), re-sent as references on **every** shot; faces kept large
  because "in a wide shot the face lands on too few pixels for the reference to hold"; reference budget: "The location
  is never dropped; characters are trimmed from the end of the director's most-important-first ordering"; renders cached
  by content hash.
- *Voice*: `voices.py` renders a ~5 s H3 clip of each character speaking a neutral sentence from its sheet and keeps the
  audio ("the voice comes from the face H3 will actually render"); used as `<Audio j>` timbre references; README limits:
  3 audio references per shot, **15 s of reference audio in total**, **≥2 s each**.

**Studio today.** `takePrompt` (`src/server/story/prompts.ts:52-68`) describes people by appearance and appends `<d>` lines,
but binds no reference to a subject (no `<Picture i>`, `<Subject N>`, `<Audio j>`, speaker id); `preflightTake` refuses
more than 9 pictures (`src/server/org/preflight.ts:47`) instead of trimming by policy, and checks audio references by
count only (`preflight.ts:16,60`). The studio relies on continuation guides (acceptance B chained 4 continuation shots,
`docs/IMPLEMENTATION-CHECKLIST.md` 14.10) — the approach StoryBuilder's code retired.

**Adopt now (characters, voice):** the cast-pass schema and rules for `DESIGN_CHARACTER` (appearance 70–120 words with a
complete default outfit, identity = age/sex/role only, a 20–40-word speaking-voice description feeding the voice brief,
`seen` for off-screen voices, groups with stated variety, animals as characters); portrait-first identity; the
reference-budget policy and the H3 audio limits (≤3, ≤15 s total, ≥2 s each) in preflight. **Adopt later (Shows/Shorts):**
windowed three-pass staging and its rules; subject binding with placeholders resolved after the reference list is final;
retention markers; an A/B of hard cut + references versus continuation guides on join quality; editor ideas (trim
without re-render, per-shot prompt override, single-shot re-render, narration track). **Reject:** installing the node
pack into the studio's ComfyUI (arbitrary Python inside the engine; `llama_server.py` starts a local server); the H3
"voice from the face" as a voice identity (conflicts with the audio-first pipeline where the TTS line carries timbre, no
dialect control for Iraqi, and the studio forbids generated audio as an identity source — hand the idea to
`VOICE-IDENTITY-V2.md` as an audition-only option for non-Iraqi characters at most); the Krea2 stack (the image stack is
evaluated in `CHARACTER-IMAGE-V2.md`; Krea2's licence was not checked); its README as a specification.

---

## 4. Comfy-Org/ComfyUI — production client practice

**Verified** (`api.github.com/repos/Comfy-Org/ComfyUI/{releases,tags,commits,compare/v0.38.0...v0.38.1,compare/v0.38.1...v0.38.2}`;
raw `server.py` and `execution.py` and `main.py` on `master`; `server.py` and `comfy/cli_args.py` **at tag v0.38.1**;
docs.comfy.org H3 pages; read 2026-10-02/03).

- **Versions.** Tags: v0.38.0 (release 2026-09-29), v0.38.1 (2026-09-30: Qwen-Image 2.1 cache fix + partner nodes),
  v0.38.2 (2026-10-02: FLUX 3 / Grok partner nodes, templates only). On `master`, not in any tag yet:
  `83071e1` "Fix minimax vae offload issue" (2026-09-30), `2d6b732` "Reduce MiniMax-H3 peak VRAM by releasing embedding
  temporaries" (2026-10-01), `170594` "add --offline and --disable-partner-nodes, deprecate --disable-api-nodes".
- **`POST /prompt`** (v0.38.1, **verbatim**): reads a client `prompt_id` and validates it as a UUID
  (`validate_job_id`); also `client_id`, `number`, `front`, `extra_data`, `partial_execution_targets`. Success →
  `{prompt_id, number, node_errors}`. Validation failure → **HTTP 400** `{"error": {type, message, details, extra_info},
  "node_errors": {id: {errors[], dependent_outputs[], class_type}}}`. Prompt-level types: `missing_node_type`,
  `prompt_no_outputs`, `prompt_outputs_failed_validation`, `invalid_prompt_id`; node-level: `required_input_missing`,
  `bad_linked_input`, `return_type_mismatch`, `invalid_input_type`, `value_smaller_than_min`, `value_bigger_than_max`,
  `value_not_in_list` (a missing model file shows up here), `custom_validation_failed`, `dependency_cycle`,
  `exception_during_validation`.
- **WebSocket `/ws?clientId=`**: initial `status` (queue info, `sid`); optional `feature_flags` handshake; events
  `execution_start`, `execution_cached {nodes}`, `executing {node, display_node}`, `progress {value, max, node,
  prompt_id}` (sampler steps), `executed {node, output}`, `execution_error {node_id, node_type, executed,
  exception_message, exception_type, traceback, current_inputs, current_outputs}`, `execution_interrupted`,
  `execution_success`; all carry `prompt_id`.
- **OOM**: detected with `model_management.is_oom`, logged "Got an OOM, unloading all loaded models", reported as
  `execution_error` with a tip.
- **`/history`**: entry `status {status_str: success|error, completed, messages}`; `GET ?max_items&offset`;
  `POST {clear}` / `{delete:[ids]}`. History lives in memory (lost on restart; outputs stay on disk).
- **`POST /interrupt`** (v0.38.1, **verbatim**): with `{"prompt_id"}` it interrupts only if that prompt is running; without
  a body it interrupts whatever runs. **`POST /queue`**: `{clear}` or `{delete:[ids]}` for pending prompts.
- **`POST /free`** `{unload_models, free_memory}`; `/object_info[/{class}]`, `/system_stats`, `/features`,
  `/models/{folder}`, `/view?filename&subfolder&type`, `/upload/image` (`image`, `overwrite`, `type`, `subfolder`).
- **Flags in v0.38.1** (**verbatim** from `cli_args.py`): `--disable-api-nodes`, `--disable-all-custom-nodes`,
  `--whitelist-custom-nodes`, `--enable-manager`, `--disable-comfy-compiler`, `--cache-lru|--cache-none|--cache-ram`,
  `--reserve-vram`, `--disable-smart-memory`, `--max-upload-size` (default 100 MB). Not in v0.38.1:
  `--disable-partner-nodes`, `--offline`.

**How the studio drives it** (`src/server/providers/comfy.ts`, `video.ts`, `src/worker/gpu.ts`, `docker/comfyui/*`):
graphs built in code and content-hashed (`src/server/workflows/index.ts:43-47`, good); `/upload/image` with
content-hash names and `overwrite` (idempotent, good); polling `/history` every 2 s plus `/queue` for position; resume
by a recorded prompt id; pinned tag `v0.38.1`, no custom nodes, `--disable-comfy-compiler` (good).

**Reliability gaps, concretely:**

| # | Gap | Evidence | Consequence |
|---|---|---|---|
| C1 | prompt id recorded *after* `POST /prompt` returns | `comfy.ts:90-93` | a crash between submit and `onSubmitted` makes the next attempt submit a second 4–7 min generation |
| C2 | every HTTP 4xx becomes `PROVIDER`; the body's `error.type` / `node_errors` are only text | `comfy.ts:24` | `PROVIDER` is retryable (`runs.ts:49`, `worker/index.ts:91`): a missing model (`value_not_in_list`) or a graph bug is retried blindly with backoff; a 400 containing "/prompt … missing" is classed `PROMPT_AMBIGUITY` by the regex at `runs.ts:31` |
| C3 | `execution_error` reduced to a JSON string; `exception_type`/`node_type` not used | `comfy.ts:102-105` | OOM only caught if the text happens to match `/out of memory|cuda|vram/` (`runs.ts:28`, which also catches any "CUDA error") |
| C4 | a prompt that vanished (ComfyUI restarted: not in history, not running, not pending) is not detected | `comfy.ts:97-123` | the job waits for the 90-min timeout (`video.ts:105`) |
| C5 | cancel and timeout call a global `/interrupt` | `comfy.ts:60,98,121` | kills whatever is running (possibly another prompt) and leaves our own prompt pending in the queue to run later |
| C6 | no `/ws`: progress is queue position only | `comfy.ts:114-120` | no step progress, failures seen only on the next poll; Node 22.20 (`docker/worker.Dockerfile:4`) has a global `WebSocket`, no new dependency needed |
| C7 | history never deleted; output prefix `vewbox/h3` is not job-specific; output picked as "first video of any node" | `video.ts:101,106`, `comfy.ts:146-149` | after a ComfyUI restart a finished output cannot be found by job; history grows in ComfyUI's memory |
| C8 | no startup capability check: version not asserted, node classes checked only for 5 image nodes, video readiness = one filename substring | `images.ts:46`, `video.ts:119-123` | a wrong image or missing weights fail at generation time |
| C9 | `comfy.free()` is defined but **never called**; the GPU lease registers unloaders only for TTS and ASR; the LLM (Ollama, `keep_alive: '2m'`) is outside the lease | `comfy.ts:56-58`, `voice.ts:30-31`, `gpu.ts:35-37`, `llm.ts:60` | VRAM contention between ComfyUI, the voice services and the LLM; acceptance B lost two PLAN_SHOTS attempts to 180 s LLM timeouts "while image jobs held the GPU" (checklist 14.10) |
| C10 | partner (API) nodes not disabled; `torchvision`/`torchaudio` unpinned; two Lightning LoRAs without bytes/sha256 in the manifest | `docker/comfyui/entrypoint.sh`, `docker/comfyui/Dockerfile:17`, `docker/models/manifest.json:22,24` | larger attack/billing surface; non-reproducible image |

**Adopt now** (character creation already runs portraits and sheets through ComfyUI): C1–C9 fixes in §9; add
`--disable-api-nodes --disable-all-custom-nodes` to the entrypoint. **Adopt later:** bump to the first tag containing
`83071e1` and `2d6b732` after a regression run of the H3 templates; `--disable-partner-nodes`/`--offline` once on that
tag. **Reject:** tracking `master`; ComfyUI-Manager; custom nodes; partner nodes. v0.38.2 brings nothing the studio uses —
stay on v0.38.1.

---

## 5. index-tts/index-tts (IndexTTS 2 / 2.5)

**Verified** (https://github.com/index-tts/index-tts README; raw `indextts/infer_v2_5.py`, `webui.py`, `LICENSE`,
`DISCLAIMER` on `main`; `api.github.com/repos/index-tts/index-tts/{commits,releases,contents}`; commits `ee40fa7`,
`6e353fe`, `d9e41aa`; https://huggingface.co/IndexTeam/IndexTTS-2.5; read 2026-10-03).

- **Versions.** IndexTTS-2 announced 2025-09-08 ("precise synthesis duration control … not yet enabled in this
  release"); IndexTTS-2.5 announced 2026-08-10; GitHub releases `v2.0.0` and `v2.5.0` both published 2026-08-13. `main`
  has later fixes: `ee40fa7` (2026-08-18, WAV saturation on torchaudio ≥2.9 — **save path only**, in-memory returns
  unaffected), `6e353fe` (2026-09-29: `do_sample` was parsed and then a literal `True` passed — "greedy decoding has
  never been reachable through the public `infer()` API"), `d9e41aa` (2026-09-29: 20 ms raised-cosine tail fade against
  clicks when the stop token comes early), plus speaker-cache performance fixes.
- **Languages.** 2.5: Chinese, English, Japanese, Spanish, Arabic (README, model card). In `infer_v2_5.py` text
  normalisation exists only for `zh/zhen/en` and `ja/es`; **no Arabic branch** (an `AR` code passes through
  un-normalised). How the model consumes a `lang` other than the five codes could not be confirmed.
- **API** (`infer_v2_5.py`): `IndexTTS2(cfg_path, model_dir, use_bf16, device, use_cuda_kernel, use_deepspeed, use_accel,
  use_torch_compile, use_qwen_emo)`; `infer(spk_audio_prompt, text, output_path, lang, emo_audio_prompt=None,
  emo_alpha=1.0, emo_vector=None, use_emo_text=False, emo_text=None, use_random=False, interval_silence=200,
  max_text_tokens_per_segment=120, stream_return=False, more_segment_before=0, duration_factor=1.0,
  text_normalization=True, **generation_kwargs)`; generation defaults `do_sample=True, top_p=0.8, top_k=30,
  temperature=0.8, length_penalty=0.0, num_beams=3, repetition_penalty=10.0, max_mel_tokens=1500`. Returns
  `(22050, int16)` when `output_path` is None.
- **Cloning.** Zero-shot from `spk_audio_prompt`, cut to **15 s** (`_load_and_cut_audio(…, 15)`); no recommended length is
  published. "Enabling random sampling reduces the voice cloning fidelity."
- **Emotion.** Four modes (webui): same as speaker; **emotion reference audio** (`emo_audio_prompt` + `emo_alpha`; when
  absent it defaults to the speaker clip with alpha 1.0); 8-float vector `[happy, angry, sad, afraid, disgusted,
  melancholic, surprised, calm]`; text (`use_emo_text`/`emo_text`, needs `use_qwen_emo=True`). `normalize_emo_vec`
  (**verbatim**) applies biases `[0.9375, 0.875, 1.0, 1.0, 0.9375, 0.9375, 0.6875, 0.5625]` and caps the sum at 0.8 — but
  `infer()` never calls it; the webui does before every vector request. Webui default emotion weight 0.65.
- **Duration.** 2.5: `duration_factor` 0.5–2.0 (webui "v2.5-only"); no docstring states its direction.
- **Licence.** `LICENSE` = bilibili Model Use License Agreement (code + weights + derivatives): separate licence needed
  above 100 M MAU or RMB 1 bn revenue; "You may not Use the bilibili indextts2 or any Derivative Work to improve any AI
  model, except …"; PRC law, Shanghai arbitration. `DISCLAIMER` (Chinese) forbids cloning unauthorised individuals and
  public figures and lists "commercial use without permission" among prohibited uses; the README tells commercial users
  to contact `indexspeech@bilibili.com`; the model card says users must obtain consent before cloning. **The licence and
  the disclaimer conflict on commercial use — get written confirmation before a commercial release.**

**Studio service** (`docker/tts/app.py`, `docker/tts/Dockerfile`, `src/server/providers/speech.ts`): one contract over
IndexTTS 2.5 and Habibi; seeds every generator, echoes params and engine version, limits peaks to −1 dBTP, refuses bad
references, stamps synthetic provenance in the WAV — all good. Gaps:

| # | Gap | Where |
|---|---|---|
| T1 | emotion = keyword regex → fixed vectors; no emotion-reference audio, no direct vector, no text mode; vectors not normalised (e.g. `grief` sums 1.3, `warm` 1.2, `neutral` = 1.0 on `calm`, the dimension upstream biases to 0.5625); `\bsad` also matches "saddle" | `app.py:234-252,273-275` |
| T2 | generation kwargs neither exposed nor pinned in the identity; v2.5.0 always sampled regardless (fixed only on `main`) | `app.py:272`, `src/domain/types.ts:345`, `docker/tts/Dockerfile:19` (`INDEXTTS_REF=v2.5.0`) |
| T3 | no signal when `max_mel_tokens` truncates a line (the transcription check may catch it later) | `app.py:276-280` |
| T4 | Arabic text is not normalised by the engine (`lang='AR'`) | `app.py:270`; `VOICE-STACK.md` already plans worker-side normalisation |
| T5 | `duration_factor = 1/speed` assumes a direction no upstream doc states | `app.py:272` |
| T6 | blocking inference inside `async def synthesize` blocks the event loop: `/health` and `/unload` stall during a synthesis | `app.py:351-388` |
| T7 | no `/capabilities`; the worker hard-codes what each engine accepts | `speech.ts:15-17` |
| T8 | no consent or rights record on a voice (grep: none in `src/`) although the licence and the disclaimer require consent | `src/domain/types.ts:327-399` |
| T9 | weights fetched at container start without a revision or hash (`hf download IndexTeam/IndexTTS-2.5`); repo pinned to the release with the do_sample bug and no tail fade | `docker/tts/entrypoint.sh:15`, `Dockerfile:19` |
| T10 | reference written to a random temp path, so the engine's speaker-conditioning cache (keyed by path) never hits | `app.py:380-382` |

**What the service should expose** (one typed contract, echoed in headers and pinned in `VoiceIdentity.params`):
`text, lang, reference (+ referenceSha256), referenceText (Habibi), seed, durationFactor`; `emotion: {mode: 'speaker' |
'audio' | 'vector' | 'text', emoReference?, vector?[8] (normalised with upstream biases, sum ≤ 0.8), alpha}`;
`generation: {doSample, temperature, topP, topK, numBeams, repetitionPenalty, maxMelTokens}`;
`maxTextTokensPerSegment, intervalSilenceMs`; response warnings (`truncated`, `fallbackLanguage`); `GET /capabilities`
per engine (languages, modes, ranges). For Iraqi: Habibi has no emotion input; emotional Iraqi delivery still comes from
emotion-specific reference recordings (VOICE-STACK D9) — IndexTTS's `emo_audio_prompt` does not change that, because
IndexTTS is not the Iraqi engine.

**Adopt now:** T1–T3, T6–T10 (§9 P0-3); a 3-point duration test for T5. **Adopt later:** text emotion (`use_qwen_emo`)
after a VRAM and listening test. **Reject:** IndexTTS as the Iraqi engine (no dialect claim; Arabic only on an in-house
set, per VOICE-STACK §3); commercial release before the licence question is answered in writing.

---

## 6. How professional film and animation studios organise design and casting

**Read** (2026-10-03): https://pixune.com/blog/asset-creation-pipeline-in-animation/ (secondary source), web-search
summaries of animation voice casting (Backstage, AWN — both pages refused the fetch with HTTP 403), SAG-AFTRA AI
resources (https://sagaftra.org/files/sa_documents/DigitalReplicas.pdf,
https://sagaftra.org/contracts-industry-resources/member-resources/artificial-intelligence/sag-aftra-ai-bargaining-and —
search summaries only), Netflix GenAI partner guidance (press coverage only, e.g.
https://www.cined.com/netflix-publishes-generative-ai-guidelines-for-content-production/). The Toon Boom pre-production page
returned 404. What follows is standard industry practice; the sources support it but were not read in full.

- **Design.** Concept → turnaround/model sheet (front, ¾, side, back), expression sheet, colour model, cast line-up
  (relative heights) → **approval** by the art director/director (and producer/network on series) → the **model pack**:
  the approved set every downstream artist must use. Assets carry a status (WIP → for review → approved / needs changes)
  with who approved and when; a change after approval is a change request with downstream impact, not an edit.
- **Voice.** Casting director prepares a character breakdown and audition "sides", auditions, callbacks (voice
  director, producer, executives; chemistry between leads), the producer/director chooses. Dialogue is recorded
  **before** animation (pre-lay) and becomes the timing reference; the same actor and voice director keep a voice
  consistent across episodes; pickups later.
- **Rights.** SAG-AFTRA's 2024 Animation Agreement and its digital-replica terms: informed, written consent with the
  intended use described, consent again for each new project, time limits, compensation. Netflix's GenAI guidance
  requires written approval before generated output involves talent likeness or final deliverables, and no
  replacement of performances without consent.

**Compared with the studio.** The organisation already mirrors this (Casting & Character Design; Voice Casting Agent;
Character Continuity; audio-first dialogue = pre-lay). Gaps: (1) no explicit **design approval** — the lock is implicit,
set the first time a character appears in a video (`canChangeAppearance`; `CharacterRef.approved` exists per picture but
nothing gates on it); (2) no **voice casting approval** step — a voice is pinned when its proof line passes the WER/CER
gate, which proves intelligibility, not casting; (3) only two human gates (STORY, EDIT — `src/server/org/gates.ts:10-13`),
none for cast; (4) no consent/rights record (T8); (5) character design sits under the Casting Director while the Art
Director owns "one visual language" — the style sign-off should be the Art Director's even though the work stays in
Casting; (6) no line-up chart although `canon.heightCm` exists (`types.ts:479`).

**Adopt now:** a casting gate — a character is *approved* (design status + approver + revision) and its voice is
*cast* (approved identity + consent) before PRODUCE may use it; Art Director signs the style; the "model pack" view in
the UI = the approved portrait + sheet + voice proof per character. **Adopt later:** line-up chart and colour models per
show. **Reject:** relying only on the implicit "used in a video" lock.

---

## 7. Reliable multi-agent orchestration — patterns versus the studio

**Read** (2026-10-03): https://www.anthropic.com/engineering/building-effective-agents,
https://www.anthropic.com/engineering/multi-agent-research-system, https://docs.temporal.io/encyclopedia/retry-policies,
https://docs.temporal.io/activities.

Patterns: prefer predictable workflows (chains with gates, routing, orchestrator-workers) over free agents when the
steps are known; tool interfaces designed against misuse (poka-yoke); durable execution with idempotent, heartbeating
activities and resume from the last checkpoint; retry policies that separate transient from permanent failures
(non-retryable error types); human checkpoints and stopping conditions; evaluation from day one (≈20 representative
cases, LLM-as-judge rubrics, end-state evaluation, human review); observability of decisions and tool calls; versioned
rollout of agent changes.

| Pattern | Studio (verified) | Gap |
|---|---|---|
| Deterministic supervisor | PRODUCE is a deterministic orchestrator; agents are logical workers (`STUDIO-ARCHITECTURE.md` §2) — matches "workflows when predictable" | — |
| Durable execution, leases, heartbeats | Postgres `FOR UPDATE SKIP LOCKED`, 90 s lease, heartbeat every 20 s, reclaim, verified by restart drills (checklist 10.3a, 14.8) | `complete()`/`fail()` update by id only (`src/server/jobs/queue.ts:186-206`): a worker that lost its lease can still write the outcome over the attempt that reclaimed the job — add `lockedBy = workerId` fencing |
| Idempotency | enqueue idempotency keys (`queue.ts:49-52`); content-hash uploads; provider task ids recorded | ComfyUI submit window (C1); output files not keyed by job (C7) |
| Typed tool contracts | allow-list + timeout + record (`src/server/org/tools.ts:13-36`) | schemas are names only — validation "lives in the provider functions" (`tools.ts:6-9`); `permissions` never enforced; the timeout (`Promise.race`, `tools.ts:21-23`) does not cancel the underlying call, so a timed-out GPU call keeps running |
| Failure classification | 17 classes, blind retry only for infrastructure/provider/resources | classification is regex over message text (`runs.ts:18-46`) with misfires (C2, C3); provider error types should be mapped structurally first |
| "A retry needs a change" | stated in the ADR (§6) and recorded on reliability events | `retry()` requeues any failed job without a recorded change (`queue.ts:132-141`) |
| Human approval gates | STORY and EDIT (`gates.ts`) | no casting gate (§6) |
| GPU as a scarce resource | in-process lease, one family at a time (`src/worker/gpu.ts`) | in-process only (a second worker process would not coordinate); ComfyUI and the LLM not under it (C9) |
| Agents use skills | skills registered, displayed | not loaded into any prompt (§2) |
| Evaluation | measured QA inspectors; Iraqi voice suite; first-attempt metrics | no offline eval sets for the LLM agents' prompts/skills; `agent_runs` records no agent version, org version, skill versions or model (`runs.ts:62`), so before/after comparisons of a prompt or skill change are impossible |
| Observability | `agent_runs.tool_calls`, `studio_events`, reliability events, SSE | tool calls carry no input/output hash; acceptable for now |

**Adopt now:** fencing; Zod validation and `AbortSignal` cancellation at the tool boundary; structured failure mapping;
"retry requires `changeMade`" for non-retryable classes; the casting gate; versions on agent runs; first eval sets for
the casting and voice agents. **Adopt later:** a cross-process GPU lease (Postgres advisory lock) with the LLM inside it;
LLM-as-judge rubrics for story/plan output. **Reject:** adding LangGraph/CrewAI/Temporal now — the ADR's reasoning holds;
the gaps above are fixes to the existing queue, not reasons for a second system.

---

## 8. Corrections to existing studio documents

- `docs/STUDIO-ARCHITECTURE.md` §1: MiniMax-AI/skills has 17 skills (not four); its multimodal toolkit is now the
  `mmx-cli` skill (no scripts) and teaches Hailuo-2.3 / music-2.5, not H3. StoryBuilder's code defaults are 928×544, 8
  steps, euler/beta, shifts 12/3 with a refine pass; the 1344×768 / res_multistep / simple values are its README's and
  Comfy's.
- `skills/minimax-multimodal-toolkit/SKILL.md` and `skills/minimax-music-gen/SKILL.md`: upstream commit to cite is
  `60aaae52` (2026-04-18); remove `allowed-tools`.

---

## 9. Prioritised changes for this codebase

### P0 — this phase (Studio Company/agents, character creation, voice identity, UI)

1. **Casting gate and explicit approvals.** `src/server/org/model.ts` (`PIPELINE` CAST_WORLD `approval: 'HUMAN'`),
   `src/server/org/gates.ts` (`GATES.CAST_WORLD` blocking PRODUCE: every cast character design-approved and voice-cast),
   `src/domain/types.ts` (`Character.design {status: DRAFT|IN_REVIEW|APPROVED, approvedBy, approvedAt, revision}`,
   `VoiceIdentity.approval {by, at}`), `src/server/org/preflight.ts` (`preflightTake`: `character-design-approved`,
   `voice-cast` checks), approval UI in `src/components/studio/Approve.tsx` and the character page; the Art Director
   records the style sign-off. Keep the usage lock as a second line.
2. **Consent and rights on every voice.** `src/domain/types.ts` (`VoiceSample.provenance.consent {source: SELF |
   ACTOR | LICENSED_DATASET, rightsHolder, authorisedBy, date, scope}`, copied to `VoiceIdentity.consent`),
   `src/server/org/preflight.ts` (`preflightCharacter` VOICE_BUILD → `MISSING_REFERENCE`/`INVALID_INPUT` without consent),
   the voice upload route and the Voice tab. Required by the IndexTTS licence/disclaimer and studio practice.
3. **TTS contract.** `docker/tts/app.py`: emotion modes (speaker / reference audio / 8-float vector normalised with the
   upstream biases; text mode off), generation kwargs accepted and echoed, `truncated` warning, `GET /capabilities`,
   synchronous `def` endpoints (threadpool), reference cached by content hash; `src/server/providers/speech.ts`
   (`SynthesizeParams` grows `emotion`, `generation`); `src/domain/types.ts:345` (`VoiceIdentity.params` pins them);
   `docker/tts/Dockerfile:19` → a pinned `main` commit that contains `6e353fe` and `d9e41aa` (after a suite re-run);
   `docker/tts/entrypoint.sh:15` → `--revision <sha>` and a sha256 check, with the files listed in
   `docker/models/manifest.json`. Add a `duration_factor` direction test.
4. **Skills conformance.** `src/server/org/registry.ts`: parse with a YAML library (e.g. `yaml`, ISC) and validate the
   spec (name = folder, regex, ≤64; description 1–1024, no XML tags; metadata string→string; compatibility ≤500), fail
   the sync on violation; persist `metadata.version`; assert SKILL.md tools == `SkillDef.requiredTools`; new status
   `REFERENCE`. Fix `skills/h3-prompting/SKILL.md:3` (no `<d>` in the description); drop `allowed-tools` from
   `skills/minimax-*/SKILL.md` and update their text; unit test `tests/unit/skills-conformance.test.ts`.
5. **Character design schema** (from StoryBuilder's cast pass). `DESIGN_CHARACTER` prompt in
   `src/server/story/prompts.ts` / `designCharacter()` in `src/server/story/engine.ts`: appearance 70–120 words including
   a complete default outfit, identity limited to age/sex/role, a 20–40-word speaking-voice description into
   `voice.timbre`/`voice.notes` (the brief for voice casting), `seen` for off-screen-only characters, animals as
   characters. New `skills/character-design/SKILL.md` (Casting Director, Character Designer) with
   `references/storybuilder-cast-rules.md` (provenance: commit `47b6ceb`, MIT notice).
6. **Versions on agent runs.** Migration adding `agent_version`, `org_version`, `skill_versions jsonb`, `model` to
   `agent_runs`; `src/server/org/runs.ts` `startRun` fills them; the agent page shows them.
7. **Skills at runtime, or honest labels.** For LLM agents (`head-of-story`, `screenwriter`, `film-director`,
   `casting-director`): prepend the agent's skill list (name + description) and the body of the skill matching the job
   type to the `story.structured_answer` system prompt within a token budget (call sites in `src/server/story/engine.ts`).
   Until then, label skills and `systemInstructions` on `src/app/(app)/studio/agents/[id]/page.tsx` as documentation.
8. **ComfyUI client** (`src/server/providers/comfy.ts`; used by portraits and sheets now): generate the `prompt_id`
   (UUID) and record it on the job before `POST /prompt`; parse a 400 into `{type, node_errors[].errors[].type}` and
   map — `missing_node_type`/`value_not_in_list` on a loader → non-retryable `INFRASTRUCTURE` ("model or node missing"),
   other node errors → `WRONG_PARAMETERS`; parse `execution_error` (`exception_type`, `node_type`) — OOM →
   `RESOURCE_EXHAUSTION`, call `/free`, retry once; detect a lost prompt after three consecutive polls absent from
   history, running and pending → `INFRASTRUCTURE` at once; cancel = `POST /queue {delete:[id]}` when pending,
   `POST /interrupt {prompt_id}` when running; subscribe to `/ws?clientId` for `executing`/`progress`/`execution_*`
   (keep `/history` polling as fallback); `POST /history {delete:[id]}` after the output is in the library;
   `filename_prefix` = `vewbox/<family>/<jobId>-a<attempt>` and read the output of the known save node
   (`src/server/workflows/*.ts`, `src/server/providers/video.ts:101-106`, `src/worker/handlers/images.ts`).

### P1 — reliability that every department needs (next)

9. **Queue fencing.** `src/server/jobs/queue.ts` `complete`/`fail`/`setProgress`: `where id = ? and locked_by = ?`;
   a zero-row update means "lease lost" and the result is discarded with an event.
10. **Tool boundary.** `src/server/org/tools.ts`: a schema registry keyed by `ToolDef.inputSchema/outputSchema` (Zod),
    validate both sides; pass an `AbortSignal` into `fn` and abort on timeout (providers accept it); enforce
    `permissions` (`minimax` only with a key).
11. **Failure mapping.** `src/server/org/runs.ts` `classifyFailure`: read `StudioError.details.providerErrorType` first
    (ComfyUI types, MiniMax `error.type`, HTTP status), regex last; narrow `/cuda/` and the `/prompt/ + missing` rule.
12. **Retry needs a change.** `src/server/jobs/queue.ts` `retry(id, changeMade)` and its API route: required unless the
    last failure class is retryable; written to the reliability event.
13. **GPU lease.** `src/worker/gpu.ts`: register a ComfyUI unloader (`comfy.free()`) for IMAGE/VIDEO/MUSIC; put the LLM
    under the lease or unload Ollama (`keep_alive: 0`) before a GPU family takes the card; later a Postgres advisory
    lock so two worker processes cannot both hold the card.
14. **Startup capability check.** `src/server/registry.ts` `syncRegistry`: assert `/system_stats` version == the pinned
    tag, every `class_type` used by the workflow templates present in `/object_info`, every pinned file present in
    `/models/{folder}`; record the result and refuse GPU jobs with a non-retryable `INFRASTRUCTURE` until fixed.
15. **ComfyUI image hardening.** `docker/comfyui/entrypoint.sh`: `--disable-api-nodes --disable-all-custom-nodes`;
    `docker/comfyui/Dockerfile:17`: pin `torchvision`/`torchaudio`; `docker/models/manifest.json:22,24`: bytes + sha256 +
    HF revision for the Lightning LoRAs; stay on v0.38.1 until a tag carries `83071e1` and `2d6b732`.
16. **First evals.** `skills/character-design/evals/evals.json`, `skills/iraqi-dialogue/evals/` (wrap the existing suite),
    `skills/screenwriting/evals/` — ≥3 cases each, run with and without the skill when a skill or prompt changes.

### P2 — later phases (Shows, Shorts, Music Videos)

17. Staging rules from StoryBuilder into `skills/shot-planning/references/` (windowed staging, beats with timecodes, ≤2
    cuts, no cut <3 s or >12 s, POV ≤ half a scene, ~3 words/s, "stage events", "shoot the listener", no music on shots).
18. Subject binding in `takePrompt` (`src/server/story/prompts.ts:52-68`) and `skills/h3-prompting/references/`:
    `<Subject N>` / `<Picture i>` / `<Audio j>`, `(S1)` speaker ids, retention markers, placeholders resolved after the
    reference list is final; preflight trims references by policy (location kept) and checks audio ≤15 s total, ≥2 s
    each (`src/server/org/preflight.ts:16,47,60`).
19. A/B: hard cut + references versus continuation guide on join quality before more continuation shots are planned.
20. Music prompt formula (MiniMax `prompt_guide.md`) as `skills/singing-performance/references/music-prompting.md` after
    checking ACE-Step/Music 3 caption conventions; hosted-speech syntax and the two Arabic catalogue voices in a
    `references/minimax-hosted-speech.md` for MANUAL mode when a key exists.
21. LLM-as-judge rubrics and end-state evals for story and plan outputs; description-trigger evals if skills become
    model-selected.

---

## 10. What could not be read or verified

- AWN and Backstage pages (HTTP 403), Toon Boom pre-production page (404), the Kidscreen article (empty); Netflix and
  SAG-AFTRA terms only through search summaries and press coverage.
- Whether Hailuo camera bracket commands work on H3; whether `progress_state` is a WebSocket message name in v0.38.1;
  how ComfyUI treats a resubmitted `prompt_id` that already exists; what IndexTTS 2.5 does with a `lang` outside its five
  normaliser codes; the direction of `duration_factor`; Krea2's licence; the MiniMax developer/document skills one by one.
- Remote files were read through a summarising fetch tool; items marked **verbatim** were re-read as quotations; other
  remote details may carry paraphrase error and should be re-checked against the file before code depends on them.

## 11. Sources (read 2026-10-02/03)

- MiniMax-AI/skills: https://github.com/MiniMax-AI/skills · https://github.com/MiniMax-AI/skills/tree/main/skills ·
  https://api.github.com/repos/MiniMax-AI/skills/commits · https://api.github.com/repos/MiniMax-AI/skills/git/trees/main?recursive=1 ·
  raw `skills/minimax-multimodal-toolkit/SKILL.md`, `skills/minimax-music-gen/SKILL.md`, `skills/minimax-music-gen/references/prompt_guide.md`,
  `skills/vision-analysis/SKILL.md`, `skills/gif-sticker-maker/SKILL.md`, `skills/buddy-sings/SKILL.md`,
  `skills/frontend-dev/references/{minimax-video-guide,minimax-tts-guide,minimax-image-guide,minimax-music-guide,minimax-voice-catalog,asset-prompt-guide}.md`,
  `CREDITS.md`, `.claude-plugin/plugin.json`
- anthropics/skills: https://github.com/anthropics/skills · https://api.github.com/repos/anthropics/skills/commits ·
  https://api.github.com/repos/anthropics/skills/contents/skills · raw `spec/agent-skills-spec.md`, `skills/skill-creator/SKILL.md` ·
  https://agentskills.io/specification · https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview ·
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- MinimaxStoryBuilder: https://github.com/lumosai8/MinimaxStoryBuilder · https://api.github.com/repos/lumosai8/MinimaxStoryBuilder ·
  `/commits` · raw `README.md`, `SYSTEM_PROMPTS.txt`, `prompts.py`, `director.py`, `casting.py`, `voices.py`, `nodes.py`
- ComfyUI: https://api.github.com/repos/Comfy-Org/ComfyUI/releases · `/tags` · `/commits` · `/compare/v0.38.0...v0.38.1` ·
  `/compare/v0.38.1...v0.38.2` · raw `server.py`, `execution.py`, `main.py` (master) · raw `server.py`, `comfy/cli_args.py` (v0.38.1) ·
  https://docs.comfy.org/tutorials/video/minimax/minimax-h3 · https://docs.comfy.org/tutorials/video/minimax/minimax-h3-prompt-guide
- IndexTTS: https://github.com/index-tts/index-tts · raw `indextts/infer_v2_5.py`, `webui.py`, `LICENSE`, `DISCLAIMER` ·
  https://api.github.com/repos/index-tts/index-tts/{commits,releases,contents} · https://github.com/index-tts/index-tts/commit/ee40fa7 ·
  `/commit/6e353fe` · `/commit/d9e41aa` · https://huggingface.co/IndexTeam/IndexTTS-2.5
- Studio practice and rights: https://pixune.com/blog/asset-creation-pipeline-in-animation/ · https://sagaftra.org/files/sa_documents/DigitalReplicas.pdf ·
  https://sagaftra.org/contracts-industry-resources/member-resources/artificial-intelligence/sag-aftra-ai-bargaining-and ·
  https://www.cined.com/netflix-publishes-generative-ai-guidelines-for-content-production/ (search summaries)
- Orchestration: https://www.anthropic.com/engineering/building-effective-agents · https://www.anthropic.com/engineering/multi-agent-research-system ·
  https://docs.temporal.io/encyclopedia/retry-policies · https://docs.temporal.io/activities
