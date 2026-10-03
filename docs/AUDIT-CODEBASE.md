# Codebase audit — frontend and backend (Wave A, item 2)

Date: 2026-10-03. Read-only audit; nothing in `src/`, `tests/`, `scripts/` or config was changed. Started at `dc01435`;
voice identity v2 merged during the audit (`56feb3c`, `bd6a326`), so every analysis below was **re-run on `efd56c9`**
(the last `src/` change is `bd6a326`). Line numbers refer to `efd56c9`.

## How it was verified

| Check | How |
|---|---|
| Unreachable files | Module graph built with the installed TypeScript compiler (`ts.resolveModuleName` over every static and literal dynamic `import()`), reachability from every Next entry (`page/layout/route/error/loading/not-found`), `src/proxy.ts`, `src/instrumentation.ts`, `src/worker/index.ts`, `src/server/db/cli.ts`; separately from `tests/`, `scripts/`, `tools/` |
| Unreferenced exports | TS LanguageService `findReferences` on every exported declaration in `src/` (JSX uses, type uses, re-exports included), counted per prod / test / script file; word-boundary `git grep` re-check of every "dead" name |
| Dynamic registrations | `HANDLERS` (21/21 job types have a handler), `JOB_TYPES`/`JOB_PAYLOADS` producers (every type has a UI/worker/server producer except `MEDIA_PROBE`, see C9), `COMMANDS` table, API routes, `workflowTemplates()` registry, `SKILLS[].implementedBy/verifiedBy` (read **at runtime** by `src/server/org/skills.ts:117-143` — file existence decides a skill's status), `T.dyn` prefixes (24 families), migrations `0000–0007` vs `schema.ts` (all 29 tables referenced; `continuity_versions` is write-only, kept) |
| i18n | Script over the 1,543 dictionary entries: literal use, dynamic prefixes, mid-variable templates, empty/identical/placeholder/plural checks, enumerations behind every dynamic family |
| Measurements | `tsc` cold/incremental, `vitest run`, the existing `.next` production build (stale, see H3), the dev server trace `.next/dev/trace` (61 MB, 70,636 requests, 2026-10-01 23:13 → 2026-10-03 00:53), `var/worker-detached.log`, `var/web-build-check.log`, a micro-benchmark of `hashState` |
| Not available | `knip`, `depcheck`, `ts-prune` are not installed (not installed now either); no `next build` was run (stale artifact measured instead) |

## Counts

| Category | Findings | Notes |
|---|---|---|
| A — dead code safe to delete | 6 | 1 unreachable file, 48 unreferenced exports, 7 production symbols used only by tests, 10 CSS classes, dead v2-pending branches; 375 exports used only inside their own file (drop `export`) |
| B — duplicated implementations | 7 | survivor named for each |
| C — obsolete workflows / model integrations | 9 | incl. 2 "verified clean" results (forbidden engines, Auto Idea) |
| D — fake / misleading UI behaviour | 6 | |
| E — unused dependencies / broken scripts | 2 | every other dependency verified in use |
| F — oversized modules | 8 | concrete splits given |
| G — i18n | 3 | 289 unused keys (18.7 %), 0 missing translations, 1 string set defined but never wired |
| H — measured bottlenecks | 9 | 3 need action now (job polling storm, Docker context, registry write-on-read) |

## Top 10 actions (value × risk)

1. **C1** — Replace the four-view sheet path behind "Draw expressions / outfit" (`CHARACTER_REFS`) with one Edit-2511
   pass from the canonical image; delete the sheet/view builders, the Multiple-Angles LoRA wiring and 4 registry
   templates; update `SKILLS[world-continuity].verifiedBy` and agent copy, bump `ORG_VERSION`.
2. **H4** — Stop the `/api/jobs` reload storm (33,610 requests in 25.6 h, 622 in the busiest minute): carry the job row
   in the `vewbox_jobs` NOTIFY (or fetch `?since=`), drop the 3 s / 4 s client polls.
3. **H7** — `.dockerignore`: add `.claude/` (5.18 GB, 115,726 files) and `docs/`; keep `tests/unit/**`, `skills/**`,
   `docker/models/manifest.json` (runtime evidence). Prune the 13 merged agent worktrees.
4. **C4 + D2** — Take the sample studio out of the live product: empty initial client state, remove Settings
   "Reset sample data" (keep `kind: 'sample'` for e2e behind an env flag), fix the Settings data copy.
5. **D1, D3, D4, D6** — Fix the misleading UI: "Saved on the studio server" ignores pending/failed writes; real LLM
   proposals labelled "a sample proposal"; "once it is connected" copy; `CONSENT_REQUIRED` falls back to a generic Retry.
6. **C2** — Rewrite wave-2 journeys 01/04/08 for contract v2 (they assert the removed `sheet` step, portraits and
   "Redraw this view") and remove the `sheet` step leftovers — before Wave D acceptance.
7. **H6** — Make `GET /api/registry` read-only (it syncs and writes on every read: p50 108 ms, p95 304 ms).
8. **A1–A5, E1, C6** — Delete verified dead code: `CastTab.tsx`, 48 exports, 10 CSS classes, dead v2-pending
   branches, prototype screenshot tools + `shots`/`lint` scripts, `@types/pg`.
9. **G1** — Delete the 289 unused i18n keys (after 1, 4, 5 land; re-run the script), then split the dictionary (F1).
10. **B1–B5** — Consolidate `assetFile` (×7), `usableImage/usableAudio` (×5, semantics already diverge), the two
    identity-line builders, the hash helpers, and the duplicate `syncOrg()` at worker boot.

Refactors (F) come after the cleanup, in this order: `images.ts` (with C1), `org/model.ts`, `domain/actions.ts`,
`CreateWizard.tsx`, `i18n.ts`.

## Do NOT remove (look dead to a static search, verified live)

| Item | Why it stays |
|---|---|
| `tests/unit/*.test.ts` in the worker image | `computeSkillStatus` (`src/server/org/skills.ts:129-141`) demotes a skill to DRAFT when a `verifiedBy` test file is missing on disk; 11 skills are VERIFIED this way |
| `Character.portraitAssetId`, `CharacterRef`, `CharacterRefRole` / `CHARACTER_REF_ROLES` (`vocabulary.ts:35-36`) | legacy rows (DB column `portrait_asset_id`, migration 0000), `primaryImageOf` fallback (`domain/identity.ts:30-31`), legacy FACE crop in `drawShotFrame` (`images.ts:458-460`), "views from before the canonical image" in Secondary material |
| `faceCheck` (`qwen-image.ts:173`) | used by `referenceReadGraph` (`canonical-image.ts:285`) for Image Reference mode (only its `mask` branch is test-only, A3) |
| `pino-pretty` | loaded by string as a pino transport (`src/server/log.ts:12`, `LOG_PRETTY=1`); also in `serverExternalPackages` |
| `tsx` (in `dependencies`) | worker runtime (`docker/worker.Dockerfile` CMD, `package.json` `worker`) |
| `public/sample/**`, `src/domain/sample.ts` | still the e2e fixture (`tests/e2e/helpers.ts:14`, `continuity.spec.ts:7`, journey 09) and `/api/studio/reset kind=sample`; move, do not delete (C4) |
| `pauseIntake` / `resumeIntake` | `scripts/studio-intake.ts` (operations) |
| `REMOVED_TOOLS`, `PENDING_STEPS` (`org/model.ts:156, 434`) | test guards in `org-model.test.ts` |
| `voice-design.ts`, `arabic-align.ts` | production since the voice v2 merge (`worker/handlers/voice-design.ts`, `voice-measure.ts`) |
| `continuity_versions` table | write-only audit trail (`persist.ts:154`), migration-backed; read it or keep it, no deletion |
| `MEDIA_PROBE` job type | used by `tests/api`, `tests/worker/queue.test.ts`, journey 09 as the cheap queue fixture (see C9) |

---

## A — Dead code safe to delete

**A1. `src/components/workspace/tabs/CastTab.tsx` (25 lines) — unreachable file.**
Evidence: not reachable from any entry, test or script (module graph); `FilmWorkspace.tsx:35-40` maps `?tab=cast` to
`characters`, `MusicWorkspace.tsx:42-47` to `performers`; no string reference to `CastTab`. Risk: none.
Action: delete.

**A2. 48 exported declarations with zero references anywhere** (prod, tests, scripts, tools; LanguageService + grep):

| Area | Symbols (file:line) |
|---|---|
| UI kit / players | `ArtCard`, `Skeleton`, `Legend` (`ui/cinema.tsx:31,94,107`); `CardHeader`, `Drawer`, `useMounted`, `useSaved` (`ui/kit.tsx:213,379,428,431`); `Stat`, `Kicker` (`ui/page.tsx:50,87`); `ImagePair`, `ResultSlot` (`ui/preview.tsx:44,56`); `JobLine` (`ui/jobs.tsx:98`); `useLocale` (`ui/locale.tsx:24`); `VoicePreview` (`players/Controls.tsx:111`); `useIsPlaying` (`players/PlayerProvider.tsx:123`); `createSyncBus` (`players/VideoPlayer.tsx:22`) |
| Character / store / selectors | `VoiceIdentityV2`, `isCreateCharacterJob` (`character/contract.ts:44,75`); `LookKey` (`character/look.ts:9`); `activeJob` (`studio/store.tsx:219`); `characterById`, `productionById`, `selectedTake`, `recentProductions` (`studio/selectors.ts:20,24,57,112`); `OrgRun`, `useEvents`, `hasExecutionPath` (`studio/org.ts:20,63,93`) |
| lib / domain | `isArabic`, `clip` (`lib/format.ts:46,48`); `useNarrow` (`lib/hooks.ts:66`); `CharacterProfileSchema` (`domain/commands.ts:67`); `EXAMPLE_IDEAS` (`domain/sample.ts:270`) |
| server | `listChildren`, `setProviderTask` (`jobs/queue.ts:84,264`; the test mock of `listChildren` in `create-character.test.ts:43` is never called by production); `freeSpace` (`media.ts:159`); `proxy`, `audioTail`, `fileExists`, `ffmpegVersion` (`media/ffmpeg.ts:39,149,156,158`); `departmentById`, `stepOf` (`org/model.ts:519,522`); `unrecordedTool` (`org/tools.ts:65`); `interrupt`, `forget`, `allOutputs` (`providers/comfy.ts:76,93,406`); `DESIGN_LABEL` (`providers/voice-design.ts:21`, the worker uses its own); `characterPrompt` (`story/prompts.ts:79`); `ProposalOut` (`story/schemas.ts:38`) |

Risk: low (no dynamic access: none of these names appears in a registry table, string, route or `T.dyn`).
Action: delete; `pnpm typecheck` (noUnusedLocals is on) will then flag any helper that only they used.

**A3. Production code used only by tests (7).** `primaryImage` (`components/character/identity.ts:62`, duplicate of
`primaryImageOf` + lookup), `planShots` (`story/engine.ts:343`, the worker uses `planShotsDraft` + `fitDurations`),
`skillPrompt` (`org/skills.ts:176`, the worker uses `agentPrompt`), `qwenFaceCrop` (`canonical-image.ts:244`),
`facesFromMask` (`media/image-check.ts:68`) with `faceCheck({ mask: true })` (`qwen-image.ts:180-184`, only the
`qwen-image.face-check` template uses it), `attentionItems` (`studio/selectors.ts:91`, the home page that showed it
is gone: `(app)/page.tsx` redirects to `/shows`). Action: delete with their test cases, or point the tests at the
production path (`agentPrompt`, `planShotsDraft`).

**A4. Dead branches left by the voice v2 merge.** `voiceDesignReady()` and `listeningReady()`
(`character/contract.ts:119,121`) are now constant `true` (`VOICE_DESIGN` is in `JOB_TYPES`, `jobs.ts:29`;
`recordVoiceListening` is a command, `commands.ts:22`). Unreachable: `VoiceSection.tsx:161` (`!ready` note),
`:206-209` (`pending` copy), the `NOT_CONFIGURED` guard in `contract.ts:147`, the key `cast.voice.v2Pending`, and the
`PENDING-BACKEND` comments (`contract.ts:12-13, 100-103`). Action: delete the probes and branches.

**A5. 10 custom CSS classes defined in `src/app/globals.css` and used nowhere** (no literal, no `prefix-${…}`
template): `card-flat` (272), `label-text` (254), `step-dot/step-done/step-current/step-line` (455-458),
`grid-albums` (515), `grid-tiles-wide` (520), `pulse` (628), `prose-tight` (636). Action: delete.

**A6. 375 exports used only inside their own file** (e.g. 33 in `org/contracts.ts`, 15 in `canonical-image.ts`, 13
in `comfy.ts`). Not dead; the `export` keyword widens the API for nothing. Low priority: drop `export` when a file is
touched.

## B — Duplicated implementations

| # | Duplicates (evidence) | Survivor | Risk / note |
|---|---|---|---|
| B1 | `assetFile(a)` one-liner `fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', … })` in `images.ts:45`, `voice.ts:36`, `take.ts:31`, `assemble.ts:22`, `music.ts:156`, `media-probe.ts:12-15`, `media/assembly.ts:28` | export `assetFile` from `src/server/media.ts` | none |
| B2 | `usable`/`usableImage` (`images.ts:47`, `take.ts:63`, `preflight.ts:30`) and `usableAudio` (`voice.ts:92` excludes `unavailable` and `GENERATED`; `preflight.ts:31` does not) | one pair in `src/domain/identity.ts` with the stricter audio rule | the preflight can pass a recording the worker then refuses |
| B3 | Two identity-line builders: `workflows/identity.ts:16` (`identityLine`, wave-2 sheet era) and `canonical-image.ts:92` (`canonicalIdentityLine`, v2); `images.ts:123,127` still falls back to the old one for shot frames and secondary material. Also duplicate types `IdentitySource` (`identity.ts:12` / `canonical-image.ts:63`) and `FaceBoxPx` (`image-check.ts:64` / `canonical-image.ts:208`) | `canonicalIdentityLine` and the canonical-image types | frames of legacy characters get a slightly different line (no style/age lead) |
| B4 | `stable` + `fnv` in `character/contract.ts:63-65` re-implement `canonical` + `hashString` (`domain/hash.ts:5-21`) | `domain/hash.ts` | the creation dedupe key format changes once (keys live one minute) |
| B5 | `syncOrg()` runs twice at every worker start: inside `bootstrap()` (`bootstrap.ts:33`) and again in `worker/index.ts:153`. Measured: two "organisation synced" lines 106–211 ms apart at every boot (`var/worker-detached.log`, e.g. 22:44:16.097/16.213, 00:39:32.014/32.225) | the call in `bootstrap()` | none |
| B6 | Thin twins: `planShots` vs `planShotsDraft`+`fitDurations` (`engine.ts:343-346`), `skillPrompt` vs `agentPrompt` (`skills.ts:176` vs `:161-173`) | `planShotsDraft`, `agentPrompt` | covered by A3 |
| B7 | Three voice-design candidate shapes: `DesignCandidate`/`DesignResult` in `character/contract.ts:129-144` (read from `job.result`), the provider's in `providers/voice-design.ts:118-132`, and the domain `VoiceDesignCandidate`/`VoiceDesignRecord` (`types.ts:390-428`, persisted on `c.voice.designs`) bridged by `designSummary` (`worker/handlers/voice-design.ts:210-215`) | the domain record read from studio state | verified consistent today (`designSummary` flattens `measured`/`gate`); one shape removes the adapter |

## C — Obsolete workflows and model integrations

**C1. The four-view identity sheet still runs behind a live button (highest-value finding).**
`SecondaryMaterial.tsx:63-66` starts `CHARACTER_REFS { roles: ['EXPRESSION'] | ['OUTFIT'] }` for any unlocked character
with a canonical image. The handler `characterRefs` (`images.ts:293-390`) computes
`needSheet = !partial || … || !usable(front) || !usable(face) || !usable(sheet)` (`:318`); a contract-v2 character has
no FRONT tile, face crop or sheet, so **every** request first draws the wave-2 identity sheet
(`qwenIdentitySheet`, quality mode, 1664×1216, `qwen-image.ts:100-136`), cuts it into FRONT / THREE_QUARTER / SIDE /
BACK tiles plus a face crop (6 assets), then draws the requested view from those three references with the
Multiple-Angles LoRA when present (`images.ts:61-65, 314, 351-373`; `qwen-image.ts:158-163`). One click = 2 GPU runs and
7 SECONDARY assets, 5 of them the superseded four-view pack (code-derived; not run on the GPU in this audit). The unit
test that covers it (`tests/unit/canonical-appearance.test.ts:194-205`) asserts only `made.length > 0`, so it passes
with the fan-out. The org copy says the opposite of what runs (D5).
Leftovers to remove with it: `qwenIdentitySheet`, `SHEET_TILES`, `SHEET_OUTPUTS`, `DEFAULT_FACE_BOX`, `qwenView`,
`VIEW_SPEC` entries FRONT/THREE_QUARTER/SIDE/BACK/FACE (`qwen-image.ts:81-163`); `sheetPrompt`, `viewPrompt`,
`VIEW_SEED_OFFSET` and the wave-2 `identityLine` (`workflows/identity.ts:14-74`, keep `seedFromId`/`identitySeedFor`);
`MODELS.qwenMultiAngleLora` (`workflows/index.ts:17-18`) and the re-exports (`:57-59`); registry templates
`qwen-image.edit-quality` (with the LoRA), `qwen-image.identity-sheet`, `qwen-image.identity-sheet-from-face`,
`qwen-image.view` (`registry.ts:31-34`); the LoRA in `scripts/check-comfy-nodes.mjs:108` and in the model manifest
group `images-qwen-identity` (`docker/models/manifest.json:29-32`, 295 MB; keep `mediapipe_face_fp32`); tests
`qwen-image-workflow.test.ts:52-115`; i18n `char.view.*`, `char.sheet.*`, `char.created.views/drawViews/sheet`, `gen.refs`.
**Dynamic dependency to update in the same change:** `SKILLS[world-continuity].verifiedBy` names
`tests/unit/qwen-image-workflow.test.ts` (`org/model.ts:177-178`) and `implementedBy` names
`src/worker/handlers/images.ts` — deleting or splitting those files without editing the list demotes the skill to DRAFT
at runtime (`skills.ts:133-139`); `org-model.test.ts` will catch it. Bump `ORG_VERSION` (now 7).
Action: rewrite `CHARACTER_REFS` as one `qwenEdit` pass per requested kind with `references: [canonical image]`
(EXPRESSION = 2×2 sheet prompt, OUTFIT = full-body wardrobe prompt, `tier: 'SECONDARY'`), assert one run per kind in
the test, then delete the list above. Risk: medium (GPU path; needs one real run per style).

**C2. The `sheet` step of creation and the wave-2 journeys.** The chain no longer has it (`character.ts:21-22`
`STEPS = ['design','appearance','voice']`) but `CHILD_TYPE.sheet`/`LABEL.sheet` (`character.ts:23-24`),
`CreateCharacterStep 'sheet'` (`jobs.ts:188`), the job-type comments "portrait → reference pack" and "appearance →
reference sheet → voice" (`jobs.ts:14, 28`), the normaliser bridge (`contract.ts:22-27`) and `jp.sheet` remain.
The Playwright journeys still assert the removed behaviour: `01-automatic-creation.spec.ts:40`
(`stepOf('sheet') … 'done'`, ≥ 3 children), `04-appearance-regeneration.spec.ts:41-46, 49-91` (a new `portraitAssetId`,
"Draw reference views", "Redraw this view"), `08-identity-locking.spec.ts:77,102` (`setCharacterAppearance`). They are
excluded from the default run (`QA_JOURNEYS=1`), so nothing fails today. Action: rewrite 01/04/08 for contract v2
(canonical image DRAFT → approve → lock), then drop `'sheet'` from the type and the maps (old job results in the DB are
already dropped by `normaliseStep`). Risk: low; required before Wave D.

**C3. Legacy portrait commands.** `setCharacterAppearance` (`actions.ts:388`, `commands.ts:20`) has no producer since
`setCanonicalImage`; only journey 08 calls it, as a lock probe. `addCharacterRefs` (`actions.ts:396`) is used only by
the partial path of C1 (`images.ts:378`). Action: after C1/C2, remove both commands (keep the reducers' data fields, A "Do not remove").

**C4. The sample studio inside the live product.** The server no longer seeds it (`seed.ts:39-44`, empty unless
`SEED_KIND=sample`; verified), but:
- the browser starts from it: `useState<StudioState>(seed)` (`studio/store.tsx:5, 57`) — the whole fixture ships to
  every page (H3), contrary to its own header "components never import it" (`sample.ts:8`);
- Settings → "Reset sample data" (`settings/page.tsx:117-122`) replaces the real studio and removes every non-sample
  library file (`api/studio/reset/route.ts:28-34`);
- the sample characters model the obsolete identity: a portrait + FRONT/THREE_QUARTER/SIDE/FULL_BODY/EXPRESSION refs,
  no canonical image (`sample.ts:43-50, 76`), so a reset shows "legacy portrait" everywhere; 35 of the 42
  `public/sample/characters/*.svg` files exist only for those views.
Action: initial client state `emptyStudio(DEFAULT_SETTINGS)`; remove the Settings reset-to-sample button; allow
`kind: 'sample'` only with an env flag the e2e config sets; later re-model the sample characters with canonical images
(or drop the view SVGs). Risk: low (e2e keeps working through the flag).

**C5. The "written example" Auto Idea fallback** (frontend-only era, 2026-09-26): `proposeSample`
(`CreateWizard.tsx:55-56`), the "Use a written example instead" button (`:102`, `:104`), `src/domain/proposals.ts`
templates, copy `auto.sampleBody` "…once it is connected…" (`i18n.ts:649`). The real path is the `AUTO_IDEA` job
(`:58-62`). Action: decide with the producer; at minimum fix the copy (D4) — the research-driven Auto Idea
(branch `deferred/auto-idea-research`) will replace both.

**C6. Prototype-era tooling and scripts.** `tools/shots.ts`, `tools/capture-pages.mts`, `tools/capture-states.mts`,
`tools/contact-sheet.mts`, `tools/publish-shots.mjs` were added in the frontend-only baseline `7940236` and never
touched since; they clear `localStorage['vewbox.studio.v1']` (the prototype's browser store, gone) and open tabs that
no longer exist (`/characters/abu-samir?tab=voice`, `?tab=profile`, `?tab=used`). `package.json` `shots` points at
them. Survivor for evidence screenshots: `scripts/capture-evidence.mjs` (+ `capture-character-fixtures.mjs`).
`package.json` `lint: next lint`: Next 16.3.6 has no `next lint` (`node_modules/next/dist/cli/` has no `next-lint`), and
no ESLint is installed. Action: delete the five tools and the `shots` and `lint` scripts (or add an ESLint flat config
deliberately). Risk: none.

**C7. Comments and docs that describe removed behaviour** (mislead the next engineer): `providers/minimax.ts:6`
("the legacy v1 Hailuo path kept" — only `/v2/video_generation` exists, `:85, 96`); `studio/seed.ts:12-14` and
`bootstrap.ts:7` ("fills an empty database with the sample studio"); `api/assets/route.ts:21-25` ("none is installed"
— MediaPipe is installed and used at draw time); `workflows/index.ts:60` cites `CHARACTER-IMAGE-V2-INTEGRATION.md`
(no such file); `docs/CHARACTER-CONTINUITY.md` (mentions `src/demo`, reference views), `docs/WALKTHROUGH.md`,
`docs/MODELS.md` (Multiple-Angles ×3). Action: correct with C1/C4.

**C8. Forbidden engines — verified clean, no action.** Case-insensitive search of `src/`, `scripts/`, `tools/`,
`docker/`, `skills/`, `tests/` for LatentSync, Wav2Lip, MuseTalk, SadTalker, Wan, LTX, Hunyuan, Kling, Veo, Runway,
CogVideo, SVD, AnimateDiff, Mochi, Seedance, Pika, Luma: no code, weight, workflow or manifest entry. Present and
legitimate: the failure class `LIP_SYNC_FAILURE` (`org/model.ts:515`, `runs.ts:31`), the planned role
`lipsync-inspector` with no implementation (`model.ts:462`), hosted MiniMax Hailuo names inside read-only REFERENCE
skills. `video.ts:11-14` has exactly two backends (hosted MiniMax, local MiniMax H3).

**C9. Deferred work — verified, notes only.** Research-driven Auto Idea: no code on `main`; only the planned roles
`creative-research`/`story-editor` cite the branch (`model.ts:442-443`). The branch tip (`fb3e399`) is an ancestor of
`main` (reverted), so `git branch --no-merged` does not list it; resuming needs a revert of the revert and a new
migration number (its 0004 collides with `0004_intake_pause`). `MEDIA_PROBE`: registered, handled, attributed to the
Technical Media Inspector (`model.ts:354-357`), but no page, worker or server path enqueues it — only tests do
(`tests/api/*.ts`, `tests/worker/queue.test.ts`, journey 09); the "file sweep" in `schema.ts:238` does not exist.
Keep (test fixture); either wire it to uploads or say on the agent page that it runs on request only.

## D — Fake or misleading UI behaviour

**D1. "Saved on the studio server" is shown whenever the first snapshot has loaded** (`(app)/layout.tsx:32`,
`ready ? T('app.saved') : '…'`) — also while commands are queued, in flight, or failing and being retried
(`studio/store.tsx:71-72, 117-123`; the store keeps them in `pending`/`inflight` and sets `connected=false`).
Action: expose `saving`/`unsaved` from the store and show "Saving…" / "Not saved — retrying" accordingly.

**D2. Settings → "Sample data"** (`settings/page.tsx:117-127`): the section says "The studio starts with sample
content" (`i18n.ts:379`) — false since Phase 0; the status line compares `version` with `seedVersion`
(`store.tsx:201`) and, on a studio that started empty and holds real work, reads "The sample data has been changed
since the last reset" (`i18n.ts:380`). The snapshot already returns `seeded.kind` (`api/studio/route.ts:38`).
Action: rename to "Studio data", state the real seed kind, remove the sample reset (C4).

**D3. Every Auto Idea production is labelled "Started from Auto Idea (a sample proposal)"** (`StoryTab.tsx:61`,
`i18n.ts:289`), including proposals written by the LLM through `AUTO_IDEA`; the record already distinguishes them
(`brief.fromSampleProposal`, `actions.ts` `acceptProposal`). Action: two keys, chosen by that flag.

**D4. The written example says "This is the review you will get once it is connected"** (`i18n.ts:649`) — the
studio is connected. Action: reword or remove with C5.

**D5. The organisation describes work the code does not do.** Character Designer: "CHARACTER_REFS draws optional
secondary material from the canonical image on request" (`org/model.ts:238`) — it draws a four-view sheet first (C1).
Storyboard Artist / MiniMax Video Specialist / Reference Conditioning speak of "front tiles or portraits"/"portraits"
(`model.ts:274-293`); Character Consistency Inspector compares with "the character sheet" (`model.ts:460`). These texts
are shown on `/studio/agents/*` and are the `systemInstructions` of agents that call a model. Action: rewrite with C1,
bump `ORG_VERSION`.

**D6. `CONSENT_REQUIRED` has strings but no error copy.** The merge added `err.CONSENT_REQUIRED` (+ `.hint`, `.fix`,
`i18n.ts:1194-1196`) and the code (`errors.ts:13`), but the table `KNOWN` (`ui/progress.tsx:40-51`) has no entry (nor
for `ASSET_PROTECTED`), so a consent refusal shows the generic fallback with **Retry** — which `retryNeedsChange`
refuses for this class. `KNOWN` is typed `Record<string, …>`, so `tsc` cannot catch the gap. Action: add the entries
(fix kind `reference`) and type it `Record<StudioErrorCode, …>`.

Checked and honest (no action): progress `percent` is `null` when unknown (`jobs.ts:38`, `images.ts:73`); Studio
Company edges only from recorded handoffs and "Has not run yet" for idle agents (checklist 17.7, code
`studio/company.ts`); the workspace skeleton until the first snapshot (`layout.tsx:38`); sample media badged "Sample"
wherever shown; the voice panel's former "pending" gating (now dead, A4).

## E — Dependencies

**E1. `@types/pg` (devDependency) is unused.** No `pg` import anywhere (`git grep "from 'pg'"`: none); the database
client is postgres.js (`db/client.ts:1-2`, `events.ts`), which drizzle-kit also uses. Action: remove.

**E2. `lint` script calls a CLI that Next 16 removed** (C6). Action: remove or replace.

Verified in use (kept): `drizzle-orm` (20+ files), `drizzle-kit` (`db:generate`, `db:studio`), `postgres`,
`file-type` (`server/media.ts`), `lucide-react` (`ui/icons.tsx`), `next`, `react`, `react-dom`, `pino`, `pino-pretty`
(dynamic transport), `tsx` (worker runtime), `zod` (8 server files and the client — `runCommand` validates command
arguments in the browser, `commands.ts:123-133`), `@playwright/test`, `@tailwindcss/postcss` (`postcss.config.mjs`),
`tailwindcss` (`globals.css`), `postcss`, `typescript`, `vitest`, `@types/node|react|react-dom`.

## F — Oversized, hard-to-maintain modules

| # | File | Size | Problem | Split |
|---|---|---|---|---|
| F1 | `src/lib/i18n.ts` | 1,643 lines, 153 KB; both locales | every client chunk carries EN+AR; 289 dead keys | `src/lib/i18n/{nav,studio,character,voice,production,errors}.ts` merged into `D`; later per-locale objects so a session loads one language |
| F2 | `src/server/org/model.ts` | 525 lines, 87 KB, 69 lines > 300 chars | departments, 29 agents, tools, skills, pipeline, planned roles and Arabic in one file | `org/model/{index (ORG_VERSION + re-exports), departments, agents/<department>.ts, tools, skills, pipeline, planned, arabic}.ts`; update `SKILLS[].implementedBy` paths in the same commit |
| F3 | `src/worker/handlers/images.ts` | 493 lines, 44 KB; 4 handlers | canonical image, secondary material (C1), location plates, shot frames + shared ComfyUI plumbing | `handlers/images/{run.ts (requireComfy, runGraph, fetch/adopt, draw), character-image.ts, secondary.ts, location-plates.ts, shot-frames.ts}`; update `HANDLERS` imports and skill `implementedBy` (world-continuity, character-design) |
| F4 | `src/components/wizard/CreateWizard.tsx` | 493 lines, 47 KB, 7 components, 34 lines > 300 chars | Auto Idea start, preferences, review, manual brief, manual season in one file | `wizard/{CreateWizard, AutoIdeaStart, Preferences, ProposalReview, ManualBrief, ManualSeason, StylePreview}.tsx` |
| F5 | `src/domain/actions.ts` | 713+ lines, 55 KB, ~75 reducers | every aggregate in one file | `domain/actions/{shows, productions, scenes-shots, takes, songs, characters, voice, canonical-image, locations, assets, proposals, settings}.ts` + `index.ts`; `COMMANDS` unchanged |
| F6 | `src/server/story/engine.ts` | 445 lines, 53 KB, lines up to 1,183 chars | prompt text inline with orchestration | prompts and rules to `story/prompts/*.ts`; one exported function per job |
| F7 | `src/components/character/VoiceSection.tsx` | 462 lines, 16 components/hooks | identity, evaluation, automatic, design, recording, recorder, build | `character/voice/{VoiceSection, Evaluation, Automatic, Design, Recording, Recorder, BuildVoice, hooks}.tsx` (now that v2 has merged) |
| F8 | `src/worker/handlers/take.ts` | 329 lines, 16 lines > 300 chars (max 1,057) | reference selection, prompt, generation, QA in one handler | extract `take/references.ts`, `take/prompt.ts`, `take/inspect.ts` |

Also large but coherent: `ShowWorkspace.tsx` (306 lines, 9 components), `studio/Company.tsx` (381), `ui/kit.tsx`
(31 components — a kit; delete its 4 dead parts, A2).

## G — i18n

**G1. 289 of 1,543 keys are unused (18.7 %)** — no literal use, no dynamic family, no template. Families: studio (35),
char (24), char.create (23), voice (14), home (13), orch (13), char.view (11), meta (11), wizard (10), char.ref (9),
nav (9), lib (8), char.created (7), and smaller groups (full list in the appendix). Many are the removed home page,
the old character tabs (appearance / sheet / views), and the pre-v3 studio pages. Action: delete; re-run the same
check after C1/C4/D fixes (a key counts as used when it appears as a string literal in `src/`, or matches a dynamic
family `` `prefix.${…}` ``, `'prefix.' + x` or `` `prefix.${…}.tail` ``).

**G2. Defined but not wired:** `err.CONSENT_REQUIRED*` (D6) and `voice.mode.AUTOMATIC|DESIGN|MANUAL|REFERENCE`
(`voice.mode.DESIGN` added in `bd6a326`; the voice panel uses other keys). Action: wire `err.*` (D6); use or delete
`voice.mode.*`.

**G3. Missing translations: none.** Every static key has non-empty EN and AR (enforced by the `[en, ar]` tuple type);
no AR value equals its EN value; `{placeholders}` match; plural forms are 1|2 (EN) and 1|6 (AR). Dynamic families are
complete for their enumerations: `fail.*` 17/17 `FAILURE_CLASSES`, `pipeline.*` 10/10, `stage.*` 6/6, `kind.*` 5/5,
`style.*` 3/3, `voice.pitch|pace.*` 3/3, `registry.status.*` 6/6, `orch.state*` 6/6, `voice.refuse.*` 7/7, `jp.*` covers
every phase the character and voice jobs report. (Phases of other jobs — `writing`, `planning`, `composing`,
`rendering`… — are not translated, but no page passes them through `T.dyn`.)

## H — Measured bottlenecks

**H1. TypeScript — not a bottleneck.** Cold `tsc --noEmit --incremental false`: 7.9 s wall (7.31 s total, check 5.90 s;
1,381 files, 36,379 TS lines, 864 MB). Incremental: 1.9 s. `scripts/*.ts` and `tools/*.mts` are outside the
`tsconfig` `include`; checked out-of-tree they compile clean today (exit 0). Action: add them to `include` (cost
negligible) so they cannot drift.

**H2. Unit tests — not a bottleneck.** `vitest run`: 46 files, 420 tests, 8.4 s wall (Duration 7.56 s). Slowest are
ffmpeg-backed: `voice-metrics-reference` 2.3 s / 1.6 s, `voice-reference` 1.5 s.

**H3. Client bundle (stale artifact — rebuild to confirm).** The only `.next` production build is from 2026-10-02
02:10 (`BUILD_ID 5h9zxq-8VKaB3MpAIhZZh`), before the Studio Company UI and Characters v3. In it: 47 JS chunks,
1.73 MB + 85 KB CSS. Every one of the 23 page routes loads the root chunks plus one 504 KB chunk (127 KB gzip):
≈ 1.02 MB raw / 270 KB gzip shared before any route code. That chunk contains the sample studio (≈ 29 KB region,
"Abu Samir" ×19), zod (`ZodError` from offset 120 K to 465 K) and the EN+AR dictionary. Actions: drop `sample.ts` from
the client (C4), load one locale (F1), consider `zod/mini` for the shared command schemas; then measure a fresh
`next build`.

**H4. `/api/jobs` reload storm — act now.** Dev trace, 25.6 h: 33,610 `GET /api/jobs` (p50 6 ms, p95 27 ms, 300 s server
time), busiest minute 622 requests (≈ 10/s), busiest hour 4,364 (2026-10-02 12h, live generation). Cause: every
`setProgress` NOTIFYs (`jobs/queue.ts:198-205`), ComfyUI progress is reported up to once a second
(`comfy.ts:314-320`), the creation chain reports every 3 s (`character.ts:60-61`), and each open tab answers each
`job` event by reloading the newest **300** jobs (`studio/store.tsx:96-97, 154`). On top: `CreateCharacter.tsx:103`
polls `/api/jobs/{id}` every 3 s and the jobs page every 4 s (`(app)/jobs/page.tsx:78`) although the event stream is
open. Action: send `{id, status, progress, updatedAt}` (or the row) in the NOTIFY payload and merge it client-side,
or fetch `GET /api/jobs?since=<max updatedAt>` (`listJobs` already supports `since`, `queue.ts:98`); remove the two
client polls.

**H5. Full-snapshot reads.** 8,760 `GET /api/studio` (p50 14 ms, p95 67 ms; busiest minute 630 during e2e runs). Every
`readState()` loads every table and hashes it (`studio/engine.ts:87-90`); handlers call it 3–6 times per job
(`images.ts:228, 287, 345, 381, 386`). Measured: `hashState` is cheap (0.79 ms on the 72 KB sample, 5.8 ms at 10×) — the
DB load is the cost. Action: an in-process snapshot cache keyed by `studio_meta.version`; pass `state` through
handlers instead of re-reading.

**H6. `GET /api/registry` writes on every read — act now.** `api/registry/route.ts:7-10` calls `syncRegistry()`:
ComfyUI health + 4 `listModels` + ASR health + a transaction of ~47 upserts and 15 workflow inserts, and builds
`workflowTemplates()` three times (`registry.ts:84, 90, 91`). Measured: 238 calls, p50 108 ms, p95 304 ms, max 668 ms
— the slowest JSON route in the trace; it runs on every Settings visit (`settings/page.tsx:30`). Action: GET reads
rows only; sync on worker boot (already) and on an explicit "Check again"; memoise the templates.

**H7. Docker build context and worker image — act now.** `var/web-build-check.log`: the context transfer took 120.1 s
for 1.98 GB; `next build` itself 13.5 s (compile 3.5 s, TypeScript 6.8 s). `.dockerignore` excludes `node_modules`,
`.next`, `.git`, `var`, test output and `docs/screenshots` but not `.claude/` — now 5.18 GB, 115,726 files, 15 agent
worktrees (13 of their branches already merged into `main`) — nor `docs/evidence` (94 MB). `docker/worker.Dockerfile`
copies the whole context into the **runtime** image (`COPY --chown=studio:studio . .`). Action: add `.claude/`, `docs/`,
`tests/e2e/`, `tools/` to `.dockerignore`; **keep** `src/`, `tests/unit/` (skill evidence, `skills.ts:117-143`),
`skills/`, `scripts/`, `drizzle/`, `docker/models/manifest.json` (`registry.ts:18-22`). Prune merged worktrees with the
lead's agreement (one branch, `worktree-agent-a1226c1bc08b51123`, is 10 commits ahead and unmerged).

**H8. Duplicate organisation sync at worker boot** — measured 106–211 ms per start (B5).

**H9. Media streaming — no action.** `/api/media/*` p95 up to 6.7 s, max 35.8 s: long-lived range streams of video
(chunks capped at 8 MB, `api/media/[id]/route.ts:407`), not slow responses.

Not bottlenecks (measured): `/api/studio/org` (1,560 calls, p50 9 ms), `/api/studio/org/reliability` (1,138, p50 15 ms),
`/api/commands` (518, p50 19 ms), the proxy (108,230 invocations, p50 1 ms; no password set).

---

## Appendix — the 289 unused i18n keys (by family)

- **studio** (35): studio.accepted, studio.activity, studio.agents, studio.allValidated, studio.approvals, studio.assignments, studio.attempt, studio.checksPassed, studio.currentAssignment, studio.deliverables, studio.departments, studio.executionState, studio.executive, studio.handoffs, studio.idle, studio.jobTypes, studio.lastRun, studio.lead, studio.limits, studio.median, studio.model, studio.neverRan, studio.noData, studio.qaReports, studio.qualityResults, studio.refused, studio.rejected, studio.responsibility, studio.role, studio.runs, studio.source, studio.stages, studio.title, studio.toolCalls, studio.version; plus studio.activity.hint, studio.pipeline.hint, studio.team.hint, studio.qualityResults.hint, studio.assignments.hint, studio.deliverables.hint
- **char** (24): char.addView, char.addVoice, char.appearance, char.appearanceLead, char.autoDesign, char.description, char.designing, char.editProfile, char.faceCrop, char.generate, char.generateFromRef, char.hearVoice, char.libraryLead, char.noAppearance, char.noSamples, char.outfits, char.profileLead, char.regenerate, char.regenerateFromRef, char.selectedVoice, char.setPortrait, char.viewKind, char.voiceLead, char.voiceLock; plus char.faceCrop.hint, char.noAppearance.hint, char.autoDesign.hint, char.regenerate.title, char.generate.lead, char.generate.title
- **char.create** (23): addReference, anotherLook, describe.hint, designHint, dropHint, dropPicture, for, forChip, forHint, keepChange, lead, made, needsEngine, opening, picture.hint, preferences, ready, runningHint, sheet.hint, step.appearance, step.design, step.sheet, step.voice
- **char.view** (11): BACK, draw, EXPRESSION, FACE, FRONT, FULL_BODY, notDrawn, OUTFIT, redraw, SIDE, THREE_QUARTER · **char.ref** (9): added, kept, needReference, notImage, removed, replaced, resultHint, resultNone, uploadHint · **char.created** (7): addVoice, drawPortrait, drawViews, portrait, sheet, views, voice · **char.usedIn** (6): assigned, hint, none, noneHint, videos, videosHint · **char.lock** (5): hint, look, lookAndVoice, unknown, used · **char.sheet** (3): hint, needPortrait, title · **char.usage** (3): used, video, videos · **char.appearance** (3): current, sample, uploaded
- **voice** (14): voice.all, voice.chooseStudio, voice.generate, voice.generatedLines, voice.generatedLinesHint, voice.listenOnly, voice.listenOnlyHint, voice.lockNote, voice.measured, voice.recordingsHint, voice.uploadHint, voice.uploadHintAr, voice.uploadHintShort, voice.words; plus voice.identity.{check, noneHint, reference, verified}, voice.mode.{AUTOMATIC, DESIGN, MANUAL, REFERENCE}, voice.chooseStudio.none, voice.measured.short
- **home** (13): all, attention, continueHint, create, emptyLead, lead, library, nothingWaiting, recentAssets, start, studioLibrary, welcome, welcomeNew
- **orch** (13): activeDepartments, artifacts, lead, next, node.awaiting, node.blocked, noHandoffYet, nothingPending, pending, productions, recentDecisions, selectHint, yourDecision
- **meta** (11): duration, finished, mixed, moodGenre, narrative, performance, square, status, track, vertical, wide
- **wizard** (10): auto, auto.hint, chosenIdea, describe, exampleIdeas, manual, manual.hint, needIdea, needSong, useIdea
- **nav** (9): home, jobs, library, operations, productions, projects, screening, seasons, studio
- **lib** (8): assetsCount, episode, episodes, filterKind, season, seasons, showCanon.hint, voice
- **misc** (6): ago, artwork, loading, poster, quickEdit, sampleMedia · **gen** (6): alreadyRunning, appearance, notReady, refs, voicePreview, voicePreview.text · **produce** (5): anotherTake, generateVideo, otherTakes, prepareFrames, sampleTakes
- **btn** (4): download, pause, play, rename · **tab** (4): appearance, cast, gallery, profile · **label** (4): appearsIn, portrait, references, theme · **final** (4): assemble, exportHint, lead, noCut.hint · **settings** (4): generation, theme.dark, theme.light, theme.system
- **err** (3, wire them — D6): CONSENT_REQUIRED, CONSENT_REQUIRED.fix, CONSENT_REQUIRED.hint
- **show** (3): gallery.hint, openEpisode, seasonsOf · **app** (2): sampleData, yourChanges · **shot** (2): otherTakes, selectedTake · **song** (2): playback, singers · **cast.retry** (2): whatChanged, whatChangedPh
- **single**: board.scene, loc.overview.hint, step.idea, empty.episodes, story.beats, player.provisional, jobs.retryNote, library.lead, screening.export
