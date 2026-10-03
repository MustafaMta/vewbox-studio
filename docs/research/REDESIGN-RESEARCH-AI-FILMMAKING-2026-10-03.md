# Redesign research, part 2: AI filmmaking platforms and the Production workspace (2026-10-03)

Status: research input for the redesign phase · written 2026-10-03 · product research. Companion to
`docs/research/REDESIGN-RESEARCH-2026-10-03.md` (part 1: entertainment, music, creative tools, type). Reads with
`docs/DESIGN-SYSTEM-V4.md` §5.12–§5.20 (players, timeline, cutting-room kit) and §6.6 (the cutting room).

Scope: how professional AI video platforms and filmmaking software handle generation, references, controls,
exploration, shot management, previews, iteration, progress, failure and organisation, and what Vewbox's Production
workspace, shot workspace, Screening Room and Studio Company should take from them. Principles and measurements only:
no layout, branding, artwork or copy from any reference is reused.

---

## How this was researched

- **Date.** Everything was looked at on **2026-10-03**; a source's own date is given where shown.
- **Browser.** The built-in Chromium pane, a fresh tab of my own, logged out, 1440×900, from this machine (Iraq).
  Nothing was signed into; no account was created; no form was submitted; nothing was typed into any product.
- **What "seen" means.** Public marketing pages and help-centre articles rendered in the browser, with text read from
  the DOM and a few `getComputedStyle` measurements. **The generation interfaces themselves are behind sign-in on every
  platform studied**, so interface facts below come from each vendor's own help centre, docs or release notes, and are
  labelled **(docs)**. Vendor marketing claims are labelled **(marketing)**. My conclusions are labelled *Inference*.
- **Fetched.** WebFetch and WebSearch for docs and articles. A WebSearch result summary is labelled "(summary)".
- **Consent.** The only clicks were navigation and, where offered, nothing: Higgsfield, Krea, Pika, LTX and Luma show
  cookie banners without a reject button, and nothing was accepted. Runway's help centre has no banner.
- **Copyright.** No screenshot was saved to the repository; no artwork or layout is reproduced.
- **Access limits (documented per platform below).**
  - Runway's help centre refuses fetches (403) but renders in the browser. The app (`app.runwayml.com`) needs sign-in.
  - Adobe HelpX refuses fetches (403) and several of its older URLs are 404; the current Firefly pages rendered.
  - Pika's `create.pika.art` is a login page; `help.pika.art` does not resolve.
  - Luma's `/dream-machine` now redirects to `/app`, a marketing page for "Luma agents"; the product UI needs sign-in.
  - Higgsfield has no public docs page (`/docs` 404); its blog and marketing pages rendered.
  - Krea's docs are public and detailed (`krea.ai/docs`).
  - ComfyUI's docs are public (`docs.comfy.org`); the queue page 404s.
  - LTX Studio's pages refuse fetches (header overflow) but render.
- **Local inputs (read only).** `docs/DESIGN-SYSTEM-V4.md` §5.20 and §6.6; `src/server/db/schema.ts` (`productions`,
  `scenes`, `shots`, `takes`); `src/server/org/model.ts` (pipeline, departments). The app was not opened.

---

## 0. Conclusions on one page

Twelve decisions for the Production workspace, each traced to evidence.

1. **Vewbox already has the right spine; show it.** Every serious platform organises work as *project → scenes →
   shots*, with reusable *Elements* (characters, locations, objects) and per-shot regeneration: LTX Studio
   (storyboard → scenes → shots → Retake; Elements), Krea Seedance Studio (Scene → Structure; `@elements`), Runway
   (Projects → Sessions → generations; Agent builds "storyboards and character sheets"). Vewbox's schema is already
   `productions → scenes → shots → takes` with `castIds`/`locationIds`. The workspace should make that hierarchy the
   navigation, not tabs over a flat list. (§1.1, §1.4, §1.8, §2.1)
2. **One visual preview dominates; settings sit beside it, behind disclosure.** Runway (docs): the model picker and
   settings are at the *bottom* of the generation panel, with "Advanced settings" for FPS; Firefly (docs): sections
   General · Frames · Composition · Camera · Style · Advanced; Krea (docs): the prompt box in the centre, settings
   below it, model picker bottom-left, previous sessions on the left. None shows a node graph to a creator.
   ComfyUI itself shipped **App Mode** (2026-03-10) to hide its graph: "only the inputs and outputs relevant to the
   end user." (§1.1, §1.6, §1.5, §1.7)
3. **References are first-class objects with names, not file uploads.** Krea Elements: up to 8 images plus 400
   characters of guidance under one `@tag`; Higgsfield Soul ID: a trained identity saved as a "Reference Element";
   LTX Elements: characters, locations and objects extracted from the script; Runway Gen-4 References tag images in
   the prompt. For Vewbox that is the character's canonical figure and voice, and the location's plates, chosen by
   name from the production's cast and world, never uploaded again. (§1.4, §1.3, §1.8)
4. **Camera and framing are structured fields, not prose.** Firefly's documented pickers: Shot size (5 values),
   Camera angle (5), Motion (8); Krea Seedance Studio: focal length 8–100 mm, aperture f/1.4–f/11, lens character,
   preset moves "with previews"; Higgsfield Cinema Studio: "30+ camera movement presets". Vewbox's `shots.framing` and
   `shots.cameraMove` already exist; the shot workspace should expose them as pickers with a small drawn preview,
   and keep free text for action and dialogue. (§1.6, §1.4, §1.3)
5. **Keyframes are the continuation mechanism; make "continue from this shot" one action.** Luma: `frame0`/`frame1`
   may be an image *or a previous generation*; "Extend", "Reverse Extend", "Interpolate"; Runway Gen-4: "Use Current
   Frame"; Runway's MiniMax H3 guide: first frame, or first and last, "cannot be combined with references"; Firefly:
   "Current Frame" from the playhead. Vewbox has `shots.openingFrameAssetId`/`endingFrameAssetId` and
   `takes.relation`/`continuesTakeId`. The shot workspace needs a **Continue from shot N** control that sets the
   opening frame from the previous take's tail and records the relation. (§1.2, §1.1, §1.6)
6. **Candidates side by side, one verb to choose.** Luma: "Generate multiple outputs from one prompt"; Firefly: "try
   the same prompt across models to compare results side by side"; Runway's Edit Studio: a "video versions feed" where
   "the top thumbnail is always your original"; Frame.io: version stacks and synchronised compare. Takes should
   render 2–4 across at the shot's aspect with *Use this take*, and *Compare* for any two. (§1.2, §1.6, §1.1, §1.9)
7. **Progress is phased words, never a bare percentage.** Runway documents that a bar "stuck at 90%" is normal and
   that a Cancel button appears only after 30 minutes, which is the failure mode; Luma's API states are "dreaming,
   completed, failed"; ComfyUI highlights the running node. Vewbox has real phases from its worker (`agent_runs`,
   `studio_events`) and `takes.generationMs`: show *Queued · Preparing references · Generating (2 min so far,
   last take took 3 min 40 s) · Checking (QA)*, with Cancel available from the start. (§1.1, §1.2, §1.7)
8. **Failure recovery is specific and free.** Runway (docs): usage-policy errors name "which part of your input"
   failed; generation errors refund credits "within a few minutes" and the advice is *retry → adjust inputs → try a
   different model*; ComfyUI shows "Prompt execution failed" with "Show report". Vewbox has `FAILURE_CLASSES` and
   `takes.rejectionReason`: every failed take shows its class in plain words, what is kept, and one recovery
   button; engine text goes behind *Details*. (§1.1, §1.7)
9. **Takes carry provenance and judgement, in that order of visibility.** Resolve 21 adds Good Take / Rejected tags
   and star ratings to the media pool; Runway keeps "favorite, upscale, download" under every output; Frame.io keeps
   status "Needs Review, In Progress, Approved". Vewbox's `takes` already store provider, model, seed, params,
   references, QA and cost. Show the judgement (Selected · Good · Rejected · reason) on the card; show provenance
   behind *Details*. (§1.10, §1.1, §1.9)
10. **Sessions are a weak substitute for shots.** Runway groups generations into Sessions "named something similar
    to the text prompt" because it has no shot model; Luma's Ideas is "a complete collection of everything you've
    generated". Vewbox should **not** add a sessions concept: the shot is the session, and its takes are the history.
    A per-shot "Attempts" list (all takes, including failed) replaces the scrollable session. (§1.1, §1.2)
11. **Review belongs in a theatre, with notes anchored to time and frame.** Frame.io V4: comments at a timecode,
    range comments with I/O, anchored pins on the frame, drawings, status labels, J/K/L, `?` for shortcuts;
    Runway's "Agent in Asset Comments" lets a comment address the agent. The Screening Room gets the same grammar, and
    a note can be *sent to the shot* as a regeneration brief. (§1.9, §1.1)
12. **The Studio Company shows what actually ran.** Runway Workflows open an "Active Runs" panel to "track progress
    and cancel runs"; Krea Nodes shows "compute cost, broken down per node" before execution; Linear's agent
    guidelines (part 1) require visible state and inspectable reasoning. The organisation page should draw its
    activity from `agent_runs`, `handoffs`, `qa_reports` and `takes.costUsd`/`generationMs` only: no illustrative
    numbers, no synthetic motion. (§1.1, §1.4, §3.4)

---

## 1. Per-platform findings

Each entry: what was looked at, what it does (seen / docs / marketing), what to learn, what not to copy.

### 1.1 Runway

**Looked at.** `runway.com` (seen); `runway.com/product` and `/changelog` (fetched); help-centre articles rendered
in the browser: Navigating Runway, Generating with Sessions, Introduction to Projects, Managing assets, Creating
with Gen-4 Video, Creating with Gen-4.5, Creating with Runway Agent, Creating with Edit Studio, Creating with
Minimax H3, Introduction to Workflows, Why am I receiving errors, Why is my generation stuck. The app itself is behind
sign-in and was not entered. Article dates are not shown on the help centre.

**Seen (marketing site).** Ground black; type "abcNormal" at 40 and 56 px, weight 400; navigation Creative · Dev ·
Robotics · Research · Resources · Enterprise · Pricing. The site title is "Building Real-World Intelligence".

**Docs: organisation.**
- Three areas: **Sessions** (where you generate), **Dashboard**, **Assets**. The left bar, top to bottom: New Session ·
  Home · Agent · Tool · Apps · Workflows · Recents · Projects · Assets · Favorited.
- A **Session** is "a folder or group of generations you create at a given time"; it is auto-named "something similar
  to the text prompt used in the first generation"; the session list holds the 30 most recent; outputs are ordered
  "chronologically on the right-hand pane, with your latest generations appearing at the bottom".
- **Projects** are shared spaces holding sessions, workflows and assets; "anything created outside a project will be
  private by default"; admins "track credit spend by project"; completed projects can be archived read-only.
- **Assets** appear in four structures: Recents (generations only), Projects, Assets (folders), Favorited.
- The **Home** page "puts the Agent prompt at the top"; `@` adds References, `/` runs an Agent Skill; below it,
  Presets, New at Runway, and Apps.

**Docs: the generation panel (Tool mode).**
- Video tab at the top of the panel; **model dropdown at the bottom**; an input image is dragged onto the prompt
  window; settings are Duration, Resolution, Fixed seed (Gen-4); Aspect ratio, Duration 2–10 s, and FPS "in the
  Advanced settings" (Gen-4.5). Text prompt limit 1000 characters.
- Under each output: on the right, favorite · upscale · download; on the left, a **Use** button with continuations:
  "Use as Character in Act-Two", "Use as Performance in Act-Two", "Retime Video", "Expand Video", **"Use Current
  Frame"**, "Upscale to 4K".
- The MiniMax H3 guide (relevant because Vewbox's video engine is MiniMax H3): duration 5–15 s; inputs text, image,
  video, audio; **keyframes** (first, or first and last) "cannot be combined with references"; up to 9 image
  references, 3 video references, 3 audio references; "write your prompt as if you're describing the scene you
  want to appear, as well as how each input should be used".
- **Apps** are "use-case specific workflows" (Keyframes, Character Swap, Color Grade, Performance Capture …), found
  by search in an Apps view.
- **Edit Studio (Aleph 2.0).** Upload constraints are stated as a table (2–30 s, 480p–1080p, 24–30 fps, ≤ 10 cuts).
  Single edit: "select the keyframe from the timeline → write a prompt → preview the image adjustment before starting
  the video generation". Results arrive in a **"video versions feed"**; "the top thumbnail is always your original
  video"; "select any version to continue building on it".
- **Agent.** Chat-based; settings for "Ask before generating media" vs "Automatically generate", and "Optimize
  generations for" Speed / Cost / Quality / Custom. The docs warn: "Agent's plan describes its intent, not a
  guaranteed outcome." A built-in timeline editor cuts and reorders clips. Agent can be @-mentioned in asset comments
  (changelog 2026-09-10).
- **Workflows.** Node editor with colour-coded types (orange text, blue image, yellow audio, green video); required
  inputs marked with `*`; "Run all" vs per-node "Run"; concurrent runs open an **"Active Runs" menu** to "track
  progress and cancel runs"; workflows can be published as Apps.
- **Failure.** Usage-policy errors "specify which part of your input violated our policies"; a *Send feedback* link
  for false positives; generation errors return credits "within a few minutes"; advice in order: retry, adjust inputs
  (resolution, conflicting prompt, unsupported format), try a different model. Third-party models give less
  diagnostic detail. A generation "stuck at a certain percentage (like 90%)" is "likely still actively processing";
  **Cancel appears after 30 minutes** and does not refund.
- **Changelog (fetched; dated):** Seedance 2.5 Draft Mode in Agent, 480p drafts with later enhancement (2026-10-02);
  DaVinci Resolve plugin (2026-09-23); Agent in Asset Comments (2026-09-10); Premiere/After Effects plugins
  (2026-09-08); Team Plan (2026-09-04).

**Learn**
- *Draft then enhance* (480p drafts, Turbo "to iterate", then the full model) is the industry's cost-and-time
  pattern; Vewbox should offer a **Draft** quality for exploration and a **Final** for the selected take.
- *Use Current Frame* and keyframes are how continuation is done; expose it as a verb on a take.
- Every output has three quiet utilities (favourite, upscale, download) and one *Use* menu; copy the *shape*, not the
  items.
- Constraints are stated up front as a table (Edit Studio); Vewbox's shot workspace should state its engine limits
  (duration, aspect, reference counts) in the same way.
- An *Active Runs* list with cancel is the right unit for the Production page's "On the floor".

**Do not copy**
- Sessions as an organising unit (decision 10).
- A chat box as the primary surface.
- Cancel that appears only after 30 minutes; a percentage that can sit at 90 %.
- Credits as the visible currency; Vewbox is local and measures time (`generationMs`) and, when a hosted engine is
  used, cost (`costUsd`).

### 1.2 Luma (Dream Machine → "Luma agents")

**Looked at.** `lumalabs.ai/dream-machine` redirects to `lumalabs.ai/app` (seen: a marketing page "Creative agents
for creative professionals"); `lumalabs.ai/ray` (fetched); API docs `docs.lumalabs.ai/docs/video-generation`
(fetched; "Last updated 2026-07-10"); learning hub "Navigating Boards & Ideas" and "How to use Keyframes" (fetched;
the latter dated 2024-11-06). The product UI needs sign-in.

**Seen.** Black ground, a light product screenshot showing an infinite canvas of image tiles with notes; copy about
"shared context", "Luma Skills", "Team Workspaces", "Export for Production" (EXR).

**Docs**
- **Boards** are "individual projects where you can group related images and videos"; **Ideas** is "a complete
  collection of everything you've generated". A left-hand toggle switches between them.
- The agents page (fetched) describes an "infinite and zoomable" canvas to "place, group, and compare assets", a
  Brainstorm mode that generates no media and a Create mode that does, "Master Reference Assets" for consistency,
  and exploration framed as "Generate multiple outputs from one prompt" and "Create variations from a single asset".
- **Keyframes (API):** `frame0` and `frame1` "can be either images or previously generated videos"; **Extend**
  (prompt applied after `frame0` = a video), **Reverse Extend** (`frame1` = a video), **Interpolate** (both frames
  are videos). Generation states: "dreaming", "completed", "failed". Concepts such as "camera orbit left" are a listed
  vocabulary (`/concepts/list`).
- **Ray 3.2 (marketing):** up to 16 keyframes in a clip; native 16-bit HDR and EXR (ACES AP0) export; Modify Video
  preserving performance; Reframe to other ratios; 5 or 10 s clips.

**Learn**
- A *Brainstorm* mode that produces no media is a cheap, honest first step: Vewbox's Story and Storyboard tabs are
  that mode and should say so.
- Keyframes that accept a *previous generation* are the cleanest definition of "continue from an existing shot".
- Camera moves as a *listed vocabulary* rather than free prose.
- A distinct "failed" state in the data, not a stuck bar.

**Do not copy**
- The infinite canvas for production work (fine for moodboards; poor for a shot list with order and durations).
- "Ideas" as an undifferentiated stream of everything.

### 1.3 Higgsfield

**Looked at.** `higgsfield.ai/` (seen); `/cinema-studio` (fetched); Soul ID blog (fetched, via WebSearch); `/docs`
is 404. The product needs sign-in.

**Seen.** Ground rgb(15,17,19); headings in Space Grotesk 700 at 56 px, uppercase; a left navigation of **26 items**
(Explore, Image, Video, Audio, MCP, API, AI Influencer, ChatGPT Plugin, Genjutsu, Ads Studio, Effects, Cinema
Studio, Contests, Marketing Studio, Supercomputer, 3D Jutsu, Edit, Academy, Community, Plugins, Canvas, Originals,
Help center …), many with "New"/"Top" tags; a discount banner; a wall of effect presets (INCLINE, ACT NATURAL, WORLD
MORPHING …) each a looping clip.

**Docs / marketing**
- **Cinema Studio:** "30+ camera movement presets and 50+ color palettes"; "edit each scene independently and extend
  your story in any direction"; navigation for projects, generation history, saved elements, favourites.
- **Soul ID:** train an identity from "5 or more" well-lit photos, "about 3 to 5 minutes"; it is saved as a
  **"Reference Element, a reusable asset"**; identities are "not shared automatically" across models and need separate
  training per model.

**Learn**
- A *saved identity* that is selected by name in every tool is exactly Vewbox's character contract (one canonical
  figure, one voice). Keep the selection by name.
- Camera moves as presets with a visible preview.

**Do not copy**
- The preset wall and the 26-item navigation with "New" badges: it is the opposite of restraint, and the directive
  excludes it.
- Per-model retraining of a character; Vewbox's identity pack is engine-independent by design.

### 1.4 Krea

**Looked at.** `krea.ai/` (seen); public docs (fetched): Video, Nodes, Elements, Seedance Studio, Realtime.

**Seen.** Ground rgb(16,16,16); "Suisse Intl"; a left sidebar Home · Moodboards · Train Lora · Node Editor · Assets,
then Tools (Image, Video, Enhancer, Seedance Studio, Nano Banana, Realtime, Edit); a hero carousel of models; a
"Krea Agent" card with template workflows.

**Docs**
- **Video tool layout:** "center panel with the prompt box" ("write your text prompt, adjust settings, and click
  Generate"); **left panel: previous sessions**; **bottom-left: model picker**. Settings below the prompt: aspect
  ratio, duration (6 s or 12 s), resolution (720p/1080p), **Start image**, **End image**; "not all models support all
  settings". **Extend** on hover uses "the final frame (plus preceding video context)". Advice: "test multiple models
  with the same prompt"; "start short".
- **Elements:** "up to eight reference images" plus guidelines "up to 400 characters" under one tag; referenced as
  `@maria`; "Studio attaches all of the element's images as references and places one chip in your prompt";
  reference limits vary by model (Seedance 2.5: 30; Flux 3: none); deleting an element keeps its images.
- **Seedance Studio:** "a desktop workspace for directing cinematic images and videos"; **Scene → Structure**: single
  shot, continuous take, montage, loop; camera: focal length 8–100 mm, aperture f/1.4–f/11, lens character
  (anamorphic, grain, bloom, diffusion), "preset movement selections with previews", a 3D camera path editor;
  results get `@tags` for reattachment; "reuse the prompt, model, references, direction, and settings" from a
  previous result.
- **Nodes:** an infinite canvas; six node categories; "compute cost, broken down per node" before running; a **Node
  App Builder** that exposes "only essential inputs while hiding the underlying 30+ node complexity"; a Node Agent
  that "turns a sentence into a runnable creative workflow".
- **Realtime:** canvas left, live output right; "no queue, no waiting, and no render button".

**Learn**
- The three-region generation layout (history start · prompt and preview centre · model and settings low) is the
  common denominator with Runway and Firefly.
- Elements with a chip in the prompt is the best reference UX seen: Vewbox's cast and location pickers should place
  **chips** in the shot's description and show the figure or plate on hover/focus.
- "Reuse everything from this take" is a one-click regeneration path.
- Per-step cost shown *before* running is the honest version of a progress estimate; Vewbox can show expected time
  from `generationMs` history.

**Do not copy**
- A node editor anywhere in the producer's path (the directive forbids it; Krea itself hides it behind an App
  Builder).
- A sidebar of models and product names: Vewbox names jobs, not engines.

### 1.5 Pika

**Looked at.** `pika.art/` (seen); `create.pika.art` is a login page (fetched); `help.pika.art` does not resolve.
WebSearch summaries describe "Scene Ingredients" (upload characters, objects, backgrounds into a scene).

**Seen.** A light ground rgb(250,248,244), "Telka"; copy: "Designed to be intuitive, not overwhelming. Pika is built
around self-contained tools"; apps listed as Video Studio ("a short clip to a 30-second multi-shot masterpiece"),
Color Grade, Extend Video, Pika Soundtrack, Edit Image, **Character Studio** ("a character who can be repeatedly
used"), Image Studio, Product Shot.

**Learn.** Self-contained apps named by *task* (Extend, Color Grade, Soundtrack) rather than by model. Vewbox's
equivalents are verbs on a take: *Extend*, *Retime*, *Grade*.

**Do not copy / limitation.** Nothing of the interface could be observed; treat Pika as a vocabulary reference only.

### 1.6 Adobe Firefly (and Firefly Boards)

**Looked at.** HelpX "Generate videos using text prompts" (web; rendered; "Last updated on Jun 16, 2026") and
"Generate video with Firefly models and add it to the timeline" (video editor beta; same date); the marketing page
`adobe.com/products/firefly/features/ai-video-generator` (fetched). Older HelpX URLs (including the Boards guide)
are 404; Boards is therefore covered only by the HelpX index entry "Ideation and mood boarding" and the marketing
page.

**Docs: the panel, in order**
- **General settings:** Model (Firefly Video by default; partners Veo 3.1, Luma Ray3, Kling 3.0, Runway Gen-4.5;
  "settings available … may differ depending on the video model"), Resolution, Aspect ratio; 24 fps fixed; default
  5 s.
- **Frames:** first and/or last keyframe; in the editor, "select First or Last, then select Current Frame" from the
  playhead.
- **Composition:** a reference video for layout.
- **Camera:** Motion reference (a video); **Shot size** None · Extreme close up · Close up · Medium · Long · Extreme
  long; **Camera angle** None · Aerial · Eye level · High angle · Low angle · Top down; **Motion** Zoom in · Zoom out
  · Move left · Move right · Tilt up · Tilt down · Static · Handheld.
- **Style:** presets previewed on hover.
- **Advanced:** Transparent background; Seed.
- **Mutual exclusions are stated:** a motion reference disables Shot size, Camera angle and Motion; a first/last frame
  disables Composition reference, Motion reference, Shot size, Camera angle and Style; a Style disables keyframes.
- Output goes to a **Generation history** panel and is dragged to the timeline. Marketing: "try the same prompt
  across models to compare results side by side"; an "Assembler" to "arrange, preview, and edit clips quickly".

**Learn**
- The clearest **progressive-disclosure order** in the study: General → Frames → Composition → Camera → Style →
  Advanced. Vewbox's inspector can follow the same logic with its own names.
- **Explicit exclusions** ("choosing X disables Y") shown in place, not discovered on failure. Vewbox's MiniMax H3
  rule (keyframes vs references, per Runway's guide) must be shown the same way.
- Shot size and angle as closed vocabularies, which map onto `shots.framing` and `shots.cameraMove`.

**Do not copy.** Partner-model switching as a user concern; style presets as a wall of thumbnails on every shot
(Vewbox fixes style per production).

### 1.7 ComfyUI

**Looked at.** `github.com/Comfy-Org/ComfyUI` (fetched: 136k stars); `docs.comfy.org/interface/overview`,
`/interface/shortcuts`, `/interface/features/subgraph`, `/interface/features/template`, `/interface/app-mode`,
`/troubleshooting/overview` (fetched); the App Mode announcement `comfyui.org/en/from-workflow-to-app-introducing`
(2026-03-12) and the press release (2026-03-10; summary).

**Docs**
- **Layout:** a left sidebar with Assets ("generated images, videos, and other assets"), Nodes, Models, Workflows,
  Templates; a canvas; a top bar with the open workflow and "Run and queue control"; a bottom toolbar (Help,
  Console, Shortcuts, Settings); canvas tools bottom-right (pan, minimap, toggle links).
- **Shortcuts:** Ctrl+Enter queue, Ctrl+Shift+Enter queue front, Ctrl+Alt+Enter interrupt, Ctrl+B bypass, Ctrl+M
  mute, `.` fit view, Q/W/N/M toggle the queue, workflow, node and model sidebars.
- **Templates:** a visual library; opening one checks models and shows a **download prompt listing missing files
  and their target folders**.
- **Subgraphs:** "package complex workflows into a single reusable subgraph node"; exposed input/output slots; a
  breadcrumb-like navigation bar for nesting; blueprints published to the node library.
- **App Mode (since frontend 1.41.13):** four steps (pick input nodes → pick output nodes → preview → choose default
  view); **the right panel is the input panel**; "click Run"; a **"Cancel this run"** button at the top; a bottom
  panel switches between queue and results; mobile is tab-based (inputs · output · media). Share links need Comfy
  Cloud. Motivation: clients struggled with "complexity of node-based systems"; the app shows "only essential user
  inputs".
- **Failure:** "Prompt execution failed" with **"Show report"**; "Can't Find Custom Node"; a validation toast; OOM
  errors; logs in the console.
- **README:** the queue "only re-executes the parts of the workflow that changes"; a workflow is embedded in the PNG
  it produced.

**Learn**
- The engine's own makers moved the *user* to a form-and-result view with the graph hidden; Vewbox should never
  show less than that.
- *Only re-run what changed* is a product promise worth surfacing: "Regenerate with the same seed and references" vs
  "New take".
- A missing-model prompt that names the file and where it goes is the model for Vewbox's engine-readiness messages
  on the Production page (today it shows raw exceptions; part 1, V4-06).
- "Show report" behind a plain failure headline.

**Do not copy.** Any node, link, slot or subgraph in the product. Keyboard chords with three modifiers.

### 1.8 LTX Studio (added: the closest analogue to Vewbox)

**Looked at.** `ltx.io/studio`, `/studio/platform/shot-video-editor`, `/studio/platform/ai-storyboard-generator`
(seen); blog "Top LTX Studio Features You Should Use In 2026" (seen; LTX Team, 2026-01-22). The product needs
sign-in.

**Seen (marketing)**
- Positioning: "The AI platform for video production"; "From concept to final cut".
- **Starting points:** From Script, With a Concept, From an Image, From a Video.
- **Storyboard generator:** "the AI automatically divides it into scenes and shots, extracts characters and objects as
  reusable Elements"; aspect ratio "upfront for all shots"; a **Shot Breakdown** review "showing the number of shots
  and scripted detail for each" *before* generation; customisation "at project, board, and frame levels".
- **Shot editor:** "Control shot type, camera angle, framing, and style"; **Retake** "lets you reshape specific
  moments within a shot without regenerating everything"; "LTX Studio generates short-duration shots that you can
  combine and edit in the timeline".
- **Elements:** "characters, locations, logos, font and objects"; **Projects** for team alignment.
- Exports: MP4, XML, and an auto-generated pitch deck.

**Learn**
- **Review the breakdown before generating** (shots per scene, with the scripted text) is a cheap gate that Vewbox's
  Storyboard tab should have before *Produce every shot*.
- Three levels of control (project, scene/board, shot) mirror `productions → scenes → shots`.
- *Retake* as the name for partial regeneration; Vewbox already calls outputs takes, so "New take" and "Retake this
  moment" are natural.

**Do not copy.** Pitch-deck generation; a marketing palette of purple gradients.

### 1.9 Frame.io (review and approval; V4 docs)

**Looked at.** `help.frame.io` articles: Commenting on your media, Player page features, Keyboard shortcuts
(fetched); Version stacking (legacy, 2026-04-06; part 1).

**Docs**
- Comment types: **single-frame** (a "comment bubble marking the timecode position"), **range** (brackets, or `I`/`O`),
  **anchored** (a pin on the frame), with **annotations** (arrows, lines, boxes, freehand), attachments, @mentions,
  hashtags, internal (locked) comments.
- Player: speed 0.25–1.75×, J/K/L, loop, quality, **frame guides with a Mask**, "Set Frame as Thumb", **status labels
  "Needs Review, In Progress, or Approved"** in the Properties panel, download full or proxy, "Download Still".
- Shortcuts: Space/K play, J/L shuttle, ←/→ one frame, Shift+←/→ ten frames, I/O in/out, C comment, P annotate,
  `[`/`]` previous/next asset, `?` help, Cmd+K search.
- Versions: stacked under one item; compare side by side with synchronised playback and an audio switch.

**Learn.** The complete grammar for the Screening Room (§3.3). The `[`/`]` asset navigation maps onto *previous/next
shot*.

### 1.10 Professional storyboarding, cinematography and media management

- **Storyboarder** (Wonder Unit; `wonderunit.com/storyboarder`, GitHub README; fetched). Free and open source. Boards
  with a right-panel metadata set (dialogue, action, timing, shot type); a Shot Generator that turns a typed
  description into a posed 3D reference; Fountain import; exports to Premiere, Final Cut, Avid, PDF contact sheets
  and GIF; keyboard-first ("Command + K" for commands, N for a new board, arrows to move); onion skin; guides (grid,
  centre, thirds).
  - *Learn:* a board is picture + four fields; typed descriptions generate reference frames; everything by keyboard.
- **Shot Designer** (Hollywood Camera Work; fetched). Camera diagrams with blocking animation; "A Shot List That
  Writes Itself: any changes you make in the diagram update the shot list"; a director's viewfinder with real
  formats; a scene freeze for experiments; fast enough "even with actors waiting".
  - *Learn:* the shot list is a *view of* the same data as the diagram and the board. Vewbox's Storyboard, Shots list
    and Produce tab must be views of `shots`, never copies.
- **Previs landscape** (Storyflow, "The 12 Best Previs Tools in 2026", Justkay, 2026-07-10; fetched). FrameForge and
  Unreal for 3D previs; Storyboarder, Boords and Toon Boom for 2D; LTX Studio and Runway for AI previs; Cine Tracer
  for lighting; ShotDeck for references. Praised pattern: "storyboard frames, shot list, and references on one
  board".
- **DaVinci Resolve 21** (Blackmagic "What's new" and Media page; fetched). Media pool with bins, **Smart Bins**
  ("use metadata to automatically organize"), Power Bins across projects, "over 200 metadata parameters",
  **star ratings and tags (Good Take, Untagged, Rejected)**, albums, LightBox; IntelliScript assembles a timeline
  from script text matched to transcribed audio.
  - *Learn:* take triage words; smart bins as *saved filters*, not folders; script-driven assembly.
- **Premiere** (HelpX; the old project-panel URL redirects to a new "Organize media" section, "Last updated Apr 8,
  2026"; its index lists Overview of bins, Sort and view bins, Apply labeling, Media intelligence and Search, Locate
  and link offline files). Most pages 404'd in the browser, so only the structure is recorded: bins, labels, search by
  media intelligence, offline-media relinking.
  - *Learn:* an explicit **offline/missing media** state and a relink path; Vewbox needs the same for a take whose
    file is gone from `var/library`.

---

## 2. Cross-cutting patterns

### 2.1 The hierarchy every platform converges on

| Platform | Project | Scene | Shot | Attempt | Reusable people/places |
|---|---|---|---|---|---|
| LTX Studio | Project | Scene / board | Shot (Retake) | generation | Elements |
| Krea Seedance Studio | project | Scene → Structure | result (`@tag`) | result | Elements (`@name`) |
| Runway | Project | — | Session (by prompt) | generation / version feed | References; Soul-like "Characters" in Act-Two |
| Luma | Board | — | — | Idea | Master Reference Assets |
| Higgsfield | project | scene | shot | generation | Reference Element (Soul ID) |
| Firefly | project (editor) | — | clip | Generation history | style presets, frames |
| **Vewbox (schema)** | `productions` | `scenes` | `shots` | `takes` | `characters`, `locations` (`castIds`, `locationIds`) |

*Inference:* Vewbox's model is already the most complete in the table. The workspace should expose it as a left
**outline** (scenes containing shots, with state marks), a centre **preview**, and a right **inspector** (v4 §6.6
already specifies this geometry).

### 2.2 The generation panel, as documented by three vendors

| Region | Runway (docs) | Krea (docs) | Firefly (docs) | ComfyUI App Mode (docs) |
|---|---|---|---|---|
| Prompt | panel centre; image dropped onto it | centre box | left panel, sectioned | right input panel |
| Settings | below prompt; FPS under "Advanced" | below prompt | sections General → Advanced | chosen inputs only |
| Model | dropdown at the bottom | picker bottom-left | dropdown under General | hidden |
| History | session feed on the right, newest at bottom | sessions on the left | Generation history panel | bottom panel queue/results |
| Continue | *Use* menu under the output | hover → Extend | Current Frame from playhead | — |
| Cancel | after 30 min | — | — | "Cancel this run" at the top |

### 2.3 Patterns to adopt

1. **Draft and Final** qualities (Runway Turbo/Draft Mode, Krea "start short", Seedance 2.5 Draft Mode).
2. **References by name with a chip** (Krea Elements, LTX Elements, Higgsfield Reference Elements).
3. **Closed vocabularies for camera and framing** (Firefly, Luma concepts, Krea presets with previews).
4. **Keyframes from a previous take** (Luma, Runway, Firefly).
5. **Variations side by side, one verb** (Luma, Firefly, Runway's version feed, Frame.io compare).
6. **Exclusions stated in place** (Firefly; Runway's MiniMax rule).
7. **Review the breakdown before generating** (LTX Shot Breakdown).
8. **Failure: named cause, what is kept, one recovery, cost returned** (Runway, ComfyUI "Show report").
9. **Take triage words** (Resolve: Good Take / Rejected).
10. **Status labels on the reviewed item** (Frame.io: Needs Review / In Progress / Approved).
11. **Active runs with cancel** (Runway Workflows, ComfyUI).
12. **Only re-run what changed** (ComfyUI), surfaced as "same seed and references" vs "new take".

### 2.4 Failure modes to avoid (observed)

| Failure mode | Where seen |
|---|---|
| A node graph, slots or links in the creator's path | ComfyUI (its makers hid it); Runway Workflows; Krea Nodes |
| Sessions named after prompts as the unit of organisation | Runway |
| Everything-stream of generations | Luma Ideas; Runway Recents |
| A progress bar that can rest at 90 %; Cancel after 30 minutes | Runway |
| Model names and vendor badges as navigation | Higgsfield (26 items), Krea sidebar, Pika model marquee |
| Preset walls of looping clips | Higgsfield Effects |
| A chat box as the home | Runway Home, Krea Agent card |
| Glow and saturated gradient on the generation input | Framer (part 1); Higgsfield |
| Credits as the visible unit of every decision | Runway, Krea |
| Settings that silently disable others | avoided by Firefly; a risk anywhere exclusions are not shown |

---

## 3. Recommendations for Vewbox

Everything below is built on fields that exist in `src/server/db/schema.ts` and `src/server/org/model.ts`. Where a
field does not exist, it is marked **(new)**.

### 3.1 The Production workspace (the production hierarchy)

**Structure.** One page per production; the room switches from lobby to cutting room as v4 §6.6 says. The cutting
room is a three-pane dock (v4 §5.20) whose **left pane is an outline, not a flat list**:

```
Outline (280)                          Preview (--canvas)                        Inspector (320)
Scene 1 · Riverbank · Dusk   3/3 ●     [ selected shot's selected take ]         Shot 7 · Close-up · Dolly in · 3.5 s
  1 Wide · river        ●              transport: J K L · I O · ‹ › frame · tc   Scene 2 · Hana, Layla · Kitchen
  2 Close · Hana        ●                                                        [ Draft ▾ ]  [ New take ]  [ Continue from 6 ]
  3 Two-shot            ●              ── takes ──────────────────────────────    Takes 3 · Selected v2 · Good 1 · Rejected 1
Scene 2 · Kitchen · Night   2/5 ◐      [v1] [v2 ✓] [v3 ✗]  Compare               ▸ Camera & framing
  4 …                                                                             ▸ Cast & references
  7 Close · boat        ◐ generating   film strip of every shot (v4 §5.14)        ▸ Action & dialogue
                                                                                  ▸ Generation settings
                                                                                  ▸ Details (provenance)
```

- **Scenes** come from `scenes` (`number`, `title`, `locationId`, `timeOfDay`, `characterIds`, `beats`). Each scene
  row shows *selected takes / shots* and a state mark. Collapsing a scene collapses its shots.
- **Shots** come from `shots` (`number`, `framing`, `cameraMove`, `durationSeconds`, `selectedTakeId`). The row
  shows number · framing · a 3-word subject · state (● selected take · ◐ generating · ○ no take · ✗ last take
  failed).
- **The breakdown gate (LTX).** Before *Produce every shot*, a one-screen review: per scene, the shot count, total
  duration against `targetSeconds`, missing opening frames, characters without an approved identity. It is the
  Storyboard tab's last section, not a dialog.
- **Assembly** is the Final cut tab (v4 §6.6), fed by `selectedTakeId` per shot and `takes.trimStartFrames`; the
  edit gate is the existing human approval.
- **No sessions, no "ideas" stream.** The shot's **Attempts** list (all `takes` for the shot, newest first, including
  `status` FAILED with `rejectionReason`) is the history.
- **Keyboard.** `[`/`]` previous and next shot (Frame.io); Alt+←/→ reorder (v4); G generate for the selected shot;
  the player map from v4 §5.12.

### 3.2 The shot-generation workspace

**Prominent preview.** The selected take at native ratio on `--canvas`, never smaller than 60 % of the pane width at
≥ 1280. With no take yet, the opening frame (`openingFrameAssetId`) or a title card reading the shot's purpose.

**The inspector, top to bottom (progressive disclosure; Firefly's order adapted):**

1. **Header:** "Shot 7 · Close-up · Dolly in · 3.5 s" and the scene line. Quality segmented control **Draft / Final**
   **(new: a `quality` param in `takes.params`)**. Primary **New take**; secondary **Continue from shot 6** (enabled
   when shot 6 has a selected take; it sets `openingFrameAssetId` from that take's last frame and writes
   `takes.relation = 'CONTINUATION'`, `continuesTakeId`).
2. **Takes:** radio cards 2–4 across at the shot's aspect (v4 §6.6), each with *Use this take*, a judgement word
   (Selected · Good · Rejected · reason from `rejectionReason`), duration and QA summary (`qa`). *Compare* for two.
   *Reuse settings* on any take copies its `prompt`, `params`, `seed`, `references` into the form (Krea).
3. **Camera & framing (open by default):** Framing picker (closed list, from `shots.framing`), Camera move picker
   (`cameraMove`) with a small drawn preview of the move, Duration (`durationSeconds`, bounded by the engine's 5–15 s
   per Runway's H3 guide for hosted use; the local engine's limits from `MODELS.md`), Transition (`transition`).
4. **Cast & references:** chips for the shot's characters (`characterIds`) drawn from the production's cast, each
   chip showing the figure on hover/focus and the voice state; the location plate for the scene (`scenes.locationId`,
   with its lighting state matching `timeOfDay`); opening and ending frames as two slots. **Exclusions in place:**
   "A first and last frame cannot be combined with extra reference images" (the H3 rule) shown as a line under the
   slots, with the disabled option greyed and labelled.
5. **Action & dialogue:** `action` (prose, 64ch), `dialogue` lines with the speaking character's chip, `purpose`.
   The composed prompt (`shots.prompt`) is **not** editable here; *Details* shows it.
6. **Generation settings (collapsed):** seed (fixed/new), resolution, fps, the engine's advanced knobs. Never a graph.
7. **Details (collapsed):** provenance of the selected take: `provider`, `model`, `requestId`, `params`,
   `workflowVersion`, `codeVersion`, `generationMs`, `costUsd`, QA report, in `.mono`.

**Status while generating (real phases only).** A row under the preview: *Queued · Preparing references ·
Generating · Checking*, from `agent_runs`/`studio_events`; elapsed "1 min 40 s"; expectation from the median
`generationMs` of this production's takes ("last take 3 min 40 s"); **Cancel from the first second**. Never a
percentage unless the engine reports one.

**Failure.** The failed take stays in Attempts with its class (`FAILURE_CLASSES`) in plain words ("The engine ran out
of memory" / "The reference image could not be read"), what is kept ("Your settings and references are kept"), and
one recovery per class: *Try again* (same seed), *Try with a new seed*, *Lower the resolution*, *Fix the reference*.
Engine text behind *Show report* (ComfyUI). Cost is shown only when a hosted engine charged (`costUsd`).

**Approval and regeneration.** *Use this take* sets `selectedTakeId`; *Good* and *Rejected* are take tags **(new:
`takes.rating` or reuse `status`)**; rejecting asks for a reason only when the producer wants to type one (prefilled
from QA). *Retake this moment* **(later)** = a ranged edit anchored to I/O marks, the Aleph/LTX pattern.

### 3.3 The Screening Room

- **Theatre** as v4 §6.15, plus Frame.io's grammar: notes at a timecode (C), **range notes** (I/O), **anchored
  notes** on the frame (click), drawings (P) kept as an overlay asset; `[`/`]` move between cuts (or shots when a
  cut is open in shot mode); `?` opens the shortcut sheet.
- **Status** on the cut: Needs review · In progress · Approved, which is the existing EDIT approval, shown as the slate
  word.
- **Versions:** "Cut 4 ⌄" picker; **Compare** two cuts synchronised with an audio switch.
- **Send to shot:** a note made while a shot is on screen can be sent as the brief for a new take of that shot (it
  pre-fills *Action & dialogue*); the note keeps a link back to the take it produced. This is Runway's "Agent in
  Asset Comments" made concrete for a shot model.
- **Frame guides** for 9:16 and 1:1 deliverables with a mask (Frame.io), since the production declares `aspect`.

### 3.4 The Studio Company (real execution data only)

- **Nodes** are the departments from `DEPARTMENTS`; **edges** are `PIPELINE.handsTo` plus cross-stage `dependsOn`
  (nine; part 1 §3.7). Nothing else is drawn.
- **Live state per department** comes from `agent_runs` (running / waiting / finished), `handoffs` (the last
  handoff with its time), and the two human gates (approvals pending). The state line is words: "Video · generating
  shot 7 of 20 · 2 min".
- **Costs and times** come from `takes.generationMs` and `takes.costUsd`, aggregated per department and production
  ("Video Production · 23 takes · median 3 min 40 s · $0.00 local"). No chart unless there are ≥ 20 runs; then a
  single bar per department, no donut.
- **Active runs** (Runway Workflows): a list with Cancel, the same component as the Production page's "On the floor".
- **Agent transparency** (Linear, part 1): each run row opens the run's inputs, skill and tool calls (`agent_runs`),
  QA report and failure class. Model names appear only there.
- **Nothing synthetic:** no particles, no pulsing edges, no sample counts when the studio is empty ("Nothing has run
  yet" and the pipeline drawn once).

### 3.5 What the research changes in v4 §6.6

| v4 §6.6 today | Change | Why |
|---|---|---|
| Left list "Shots with take state" | An **outline of scenes containing shots**, collapsible | Every platform's hierarchy; Vewbox's own schema |
| Header primary "Produce every shot" | Preceded by the **breakdown review** | LTX Shot Breakdown |
| Takes as radio cards | Add **Draft/Final**, **Continue from shot N**, **Reuse settings**, and the **Attempts** list including failures | Runway, Krea, Luma, Frame.io |
| Inspector "Shot fields" | The ordered, disclosed sections of §3.2 with **exclusions stated in place** | Firefly |
| Progress (unspecified) | Phased words, elapsed, expectation from history, Cancel at once | Runway's stuck-at-90 % failure mode |
| Rejected take "shows its reason" | Keep; add *Good take*, and the one-recovery failure card | Resolve 21, Runway, ComfyUI |

---

## Sources

All looked at on 2026-10-03. Dates in brackets are the source's own. "(seen)" = rendered in the browser; "(fetched)" =
WebFetch; "(summary)" = WebSearch result summary only.

**Runway** (help centre: seen; marketing: fetched)
1. https://runway.com/ (seen) · https://runway.com/product · https://runway.com/changelog [entries 2026-07-02 → 2026-10-02]
2. Navigating Runway: https://help.runwayml.com/hc/en-us/articles/24298206897043-Navigating-Runway
3. Generating with Sessions: https://help.runwayml.com/hc/en-us/articles/33545310653203-Generating-with-Sessions
4. Introduction to Projects: https://help.runwayml.com/hc/en-us/articles/52913050653203-Introduction-to-Projects
5. Managing assets: https://help.runwayml.com/hc/en-us/articles/4408611980563-Managing-assets
6. Creating with Gen-4 Video: https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video
7. Creating with Gen-4.5: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5
8. Creating with Runway Agent: https://help.runwayml.com/hc/en-us/articles/51601639579667-Creating-with-Runway-Agent
9. Creating with Edit Studio: https://help.runwayml.com/hc/en-us/articles/51683104370451-Creating-with-Edit-Studio
10. Creating with Minimax H3: https://help.runwayml.com/hc/en-us/articles/54046029551379-Creating-with-Minimax-H3
11. Introduction to Workflows: https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows
12. Creating with Apps (summary): https://help.runwayml.com/hc/en-us/articles/45570040112531-Creating-with-Apps
13. Why am I receiving errors: https://help.runwayml.com/hc/en-us/articles/32880432736659-Why-am-I-receiving-errors-when-trying-to-generate
14. Why is my generation stuck: https://help.runwayml.com/hc/en-us/articles/32881061675795-Why-is-my-generation-stuck

**Luma** (fetched unless noted)
15. https://lumalabs.ai/dream-machine → https://lumalabs.ai/app (seen) · https://lumalabs.ai/ray
16. API, video generation [last updated 2026-07-10]: https://docs.lumalabs.ai/docs/video-generation
17. Navigating Boards & Ideas: https://lumalabs.ai/learning-hub/navigating-boards-ideas · Keyframes [2024-11-06]: https://lumalabs.ai/learning-hub/how-to-use-keyframes

**Higgsfield**
18. https://higgsfield.ai/ (seen) · https://higgsfield.ai/cinema-studio (fetched) · Soul ID: https://geo.higgsfield.ai/blog/higgsfield-soul-id-character-consistency-ai-videos (fetched) · `/docs` 404

**Krea** (docs fetched)
19. https://www.krea.ai/ (seen) · https://www.krea.ai/docs/user-guide/features/video.md · …/nodes.md · …/elements.md · …/seedance-studio.md · …/realtime.md

**Pika**
20. https://pika.art/ (seen) · https://create.pika.art/create-video (login page) · help.pika.art (does not resolve) · Scene Ingredients (summary)

**Adobe Firefly** (seen; HelpX refuses fetches)
21. Generate videos using text prompts [Jun 16, 2026]: https://helpx.adobe.com/firefly/web/work-with-audio-and-video/work-with-video/generate-videos-using-text-prompts.html
22. Generate video with Firefly models and add it to the timeline [Jun 16, 2026]: https://helpx.adobe.com/firefly/web/firefly-video-editor/generate-videos/generate-video-using-firefly-models.html
23. Marketing: https://www.adobe.com/products/firefly/features/ai-video-generator.html (fetched) · Boards guide URL 404

**ComfyUI** (fetched)
24. https://github.com/Comfy-Org/ComfyUI · https://docs.comfy.org/interface/overview · https://docs.comfy.org/interface/shortcuts · https://docs.comfy.org/interface/features/subgraph · https://docs.comfy.org/interface/features/template · https://docs.comfy.org/interface/app-mode · https://docs.comfy.org/troubleshooting/overview
25. App Mode announcement [2026-03-12]: https://www.comfyui.org/en/from-workflow-to-app-introducing · press release [2026-03-10] (summary): https://www.globenewswire.com/news-release/2026/03/10/3253141/0/en/ComfyUI-Launches-App-Mode-App-Builder-and-ComfyHub-Enabling-Anyone-to-Run-AI-Workflows-Without-Touching-a-Node-Graph.html

**LTX Studio** (seen)
26. https://ltx.io/studio · https://ltx.io/studio/platform/shot-video-editor · https://ltx.io/studio/platform/ai-storyboard-generator · Top features [LTX Team, 2026-01-22]: https://ltx.io/blog/top-ltx-studio-features

**Review and filmmaking software** (fetched)
27. Frame.io: Commenting on your media https://help.frame.io/en/articles/9105251-commenting-on-your-media · Player page features https://help.frame.io/en/articles/9105311-player-page-features · Keyboard shortcuts https://help.frame.io/en/articles/9105337-keyboard-shortcuts · Version stacking (legacy) [2026-04-06] https://support.frame.io/en/articles/4431-version-stacking-and-comparison-mode-legacy
28. Storyboarder: https://wonderunit.com/storyboarder/ · https://github.com/wonderunit/storyboarder
29. Shot Designer: https://www.hollywoodcamerawork.com/shot-designer.html
30. Storyflow, The 12 Best Previs Tools in 2026 [Justkay, 2026-07-10]: https://storyflow.so/blog/best-previs-tools-2026
31. DaVinci Resolve 21: https://www.blackmagicdesign.com/products/davinciresolve/whatsnew · https://www.blackmagicdesign.com/products/davinciresolve/media
32. Premiere, Organize media (seen; "Add and delete bins", Apr 8, 2026): https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/add-and-delete-bins.html (other pages in that section 404'd)

**Local (read only)**
33. `src/server/db/schema.ts` (`productions`, `scenes`, `shots`, `takes`) · `src/server/org/model.ts` (`PIPELINE`, `DEPARTMENTS`, `FAILURE_CLASSES`) · `docs/DESIGN-SYSTEM-V4.md` §5.20, §6.6
