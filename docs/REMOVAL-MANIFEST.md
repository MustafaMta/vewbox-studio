# Removal manifest — the project becomes frontend-only (2026-09-26)

On the producer's instruction the backend, model integration and production pipeline were removed from the active
project, and the interface was rebuilt to run on local fixtures and browser state. This is the record of what went,
what stayed, and what was destroyed outside the repository.

## Destroyed outside the repository (irreversible, at explicit instruction)

| Path | Size | Contents |
| --- | --- | --- |
| `~/codes/volexar-studio-snapshot-2026-09-26/` | 4.1 GB | The one recoverable snapshot made earlier the same day: git bundle of all history, tarball of var/library + design captures + docs + e2e + scripts + packages + worker + .env, the original-uploads archive |
| `~/codes/volexar-archive/snapshot-2026-09-23-pre-v14-rebuild/` | 3.2 GB | Pre-V14 snapshot: code, config, db dump, generated media, **original uploaded source media** |
| `~/codes/volexar-studio/var/` | 2.7 GB | Runtime output: the media library, e2e traces and reports, experiments, logs, run records, the "before" screenshots of the old interface |

Each of the three paths was verified absent after deletion (`[ -e path ]` false). These are the only locations
this project knows of and the only ones deleted; no claim is made about copies elsewhere (other machines, cloud
storage, the render host), which were not inspected. Left untouched in `~/codes/volexar-archive/`: `backups`,
`engineering-archive`, `live-tests`, `live-tests-frame.png`, `volexar-studio-pre-hardening-2026-09-06.bundle` (not
listed by the producer; their contents were not examined). The Postgres service on this machine was left running:
it is a shared machine service, not this project's. The ComfyUI host was not contacted.

Git history of this repository is intact; every removed *source* file remains reachable in earlier commits. Media
and runtime output were never in git and are not recoverable from it.

## Removed from the repository

### Processes and runtime

- `apps/worker/` — the job worker (GPU scheduling, ComfyUI submission, evaluation).
- `scripts/` — `studio.sh` (start/stop web + worker), `checks/` (45 files: takes ledger, worker version, frame
  instruments), `inventory/` (matrix stabilise/build/repoint), `design/shots.ts` (read Postgres).
- `.env` and `.env.example` — DATABASE_URL, COMFYUI_BASE_URL, LIBRARY_ROOT, STUDIO_PASSWORD, WORKER_*, GPU_*, LLM_PROVIDER, API keys. The prototype needs no environment.

### Packages

| Package | Files | What it was |
| --- | --- | --- |
| `packages/db` | 14 | Drizzle schema, migrations, Postgres client |
| `packages/jobs` | 9 | Job queue, claims, GPU lease |
| `packages/inference` | 21 | ComfyUI client, workflow manifests, model adapters, engine policy |
| `packages/agents` | 30 | Creative agents (research, concept, script, storyboard, repair) and their prompts |
| `packages/evaluation` | 19 | Gate checks, measurements, evaluation suites |
| `packages/media` | 5 | ffmpeg/ffprobe wrappers, library storage |
| `packages/studio` | 25 | The studio service layer over the database |
| `packages/config` | 4 | Environment loading |
| `packages/contracts` | 8 | Zod schemas. The finite vocabularies were kept as plain TypeScript in `src/domain/vocabulary.ts`; the schemas (Brief, Concept, Script, ShotSpec, TakeProvenance, EvaluationRecord…) were removed with the pipeline that produced them. |

### Web application (was `apps/web`, now the repository root)

- `src/app/api/*` (active jobs, job detail, queue), `src/app/media/[assetId]/route.ts` (library file serving), `src/app/login/*`, `src/proxy.ts` (password gate).
- `src/lib/actions/*` (14 server-action modules), `lib/auth.ts`, `lib/data.ts`, `lib/studio.ts`, `lib/studio-db.ts`, `lib/jobs.ts`, `lib/locale.ts` (cookie settings), `lib/issues.ts`, `lib/result.ts`.
- `components/ui/live.tsx` (job polling), `decisions.tsx` (approval-role context), `TestModeBanner.tsx`, `stage-rail.tsx`.
- Every page and production component bound to the database: `components/production/*` (20 files), `components/forms/*` (4), `players/Compare.tsx`, the `queue/` and `review/` routes, and the old client files for assets, characters, locations, shows, seasons, settings.
- `next.config.ts`: `serverExternalPackages: ['pg']`, `transpilePackages`, the 200 MB server-action body limit, the monorepo turbopack root.

### Tests, tooling, docs

- `e2e/` — 55 files: the inventory crawl, fixtures spec, coverage specs (all asserted against Postgres or disk), helpers and teardown.
- `vitest.config.ts` (package suites sharing one database), `playwright.config.ts` (three projects against the running studio), root `tsconfig.json` project references, `tsconfig.base.json`, `pnpm-workspace.yaml`.
- Root `package.json` scripts: worker, db:migrate, db:generate, manifest, validate:workflows, studio, e2e:inventory, e2e:fixtures, e2e:coverage, matrix, ledger, worker:version. Dependencies: every `@vewbox/*` package, drizzle-orm, zod.
- `docs/v14/` (27 files: architecture, pipeline, acceptance plans and reports, frame pipeline, H3 prerequisites, takes ledger, test matrix, research) and the untracked `docs/v8`, `docs/v9`. `docs/v14/UI-AUDIT.md` was kept as `docs/UI-AUDIT.md`, with its reference to the deleted captures corrected.

## Kept and rebuilt

- The design system (`src/app/globals.css`), the kit, icons, the video/audio player, i18n, formatting.
- Every route, rewritten as a client component over `src/demo` (fixtures + store + pure actions). No page imports fixtures directly.
- New: `src/demo/*` (fixtures, store, actions, selectors, and `media.ts` for files kept in IndexedDB), `src/domain/*`, `public/sample/*` (107 synthetic files generated by `tools/sample-media.mjs` — sample content, not production output), `tests/unit`, `tests/e2e`, `tools/shots.ts`, this documentation.

## Not introduced

No mock API server, no fake worker, no request handlers, no queue, no placeholder backend package. Generation actions
open a dialog that says the backend is not connected. The only persistence is the browser's own storage: records in `localStorage`, files you add in IndexedDB.

## Verification

- `grep` over `src/` for `@vewbox`, `lib/studio`, `lib/actions`, `/api/`, `/media/`, `var/library`, `TestMode`: no matches.
- `find` for `.env*`, `drizzle`, `pg`, `comfy` in the project (outside `node_modules`): no matches.
- The Playwright suite fails any test whose page makes a network request to a host other than `localhost` (fonts excepted).

## Appendix — every path removed from git in this change

```
.env.example
apps/web/next-env.d.ts
apps/web/next.config.ts
apps/web/package.json
apps/web/postcss.config.mjs
apps/web/src/app/(app)/queue/client.tsx
apps/web/src/app/(app)/queue/page.tsx
apps/web/src/app/(app)/review/client.tsx
apps/web/src/app/(app)/review/page.tsx
apps/web/src/app/api/active/route.ts
apps/web/src/app/api/jobs/[id]/route.ts
apps/web/src/app/api/queue/route.ts
apps/web/src/app/login/form.tsx
apps/web/src/app/login/page.tsx
apps/web/src/app/media/[assetId]/route.ts
apps/web/src/components/forms/CharacterForm.tsx
apps/web/src/components/forms/LocationForm.tsx
apps/web/src/components/forms/ProductionWizard.tsx
apps/web/src/components/forms/ShotSpecEditor.tsx
apps/web/src/components/players/Compare.tsx
apps/web/src/components/production/BriefClient.tsx
apps/web/src/components/production/CastClient.tsx
apps/web/src/components/production/EngineCard.tsx
apps/web/src/components/production/ExportClient.tsx
apps/web/src/components/production/OverviewClient.tsx
apps/web/src/components/production/ProductionClient.tsx
apps/web/src/components/production/ProductionList.tsx
apps/web/src/components/production/ProductionPage.tsx
apps/web/src/components/production/ScriptClient.tsx
apps/web/src/components/production/ShotClient.tsx
apps/web/src/components/production/ShotPage.tsx
apps/web/src/components/production/SongClient.tsx
apps/web/src/components/production/SoundDesk.tsx
apps/web/src/components/production/StoryboardClient.tsx
apps/web/src/components/production/tabs/BriefTab.tsx
apps/web/src/components/production/tabs/CastTab.tsx
apps/web/src/components/production/tabs/ExportTab.tsx
apps/web/src/components/production/tabs/OverviewTab.tsx
apps/web/src/components/production/tabs/ProductionTab.tsx
apps/web/src/components/production/tabs/ReviewTab.tsx
apps/web/src/components/production/tabs/ScriptTab.tsx
apps/web/src/components/production/tabs/SongTab.tsx
apps/web/src/components/production/tabs/StoryboardTab.tsx
apps/web/src/components/ui/TestModeBanner.tsx
apps/web/src/components/ui/decisions.tsx
apps/web/src/components/ui/live.tsx
apps/web/src/components/ui/stage-rail.tsx
apps/web/src/lib/actions/_upload.ts
apps/web/src/lib/actions/audio.ts
apps/web/src/lib/actions/auth.ts
apps/web/src/lib/actions/characters.ts
apps/web/src/lib/actions/exports.ts
apps/web/src/lib/actions/hierarchy.ts
apps/web/src/lib/actions/library.ts
apps/web/src/lib/actions/link.ts
apps/web/src/lib/actions/locations.ts
apps/web/src/lib/actions/queue.ts
apps/web/src/lib/actions/settings.ts
apps/web/src/lib/actions/songs.ts
apps/web/src/lib/actions/story.ts
apps/web/src/lib/actions/takes.ts
apps/web/src/lib/auth.ts
apps/web/src/lib/data.ts
apps/web/src/lib/issues.ts
apps/web/src/lib/jobs.ts
apps/web/src/lib/locale.ts
apps/web/src/lib/result.ts
apps/web/src/lib/studio-db.ts
apps/web/src/lib/studio.ts
apps/web/src/proxy.ts
apps/web/tsconfig.json
apps/worker/package.json
apps/worker/src/index.ts
apps/worker/tsconfig.json
docs/v14/ACCEPTANCE-PLAN.md
docs/v14/ACCEPTANCE.md
docs/v14/ARCHITECTURE.md
docs/v14/BOUNDED-ACCEPTANCE.md
docs/v14/CAPABILITY-CHECK.md
docs/v14/CLEANUP-MANIFEST.md
docs/v14/FINAL-REPORT.md
docs/v14/FRAME-PIPELINE.md
docs/v14/FRAME-REVIEW.md
docs/v14/H3-PREREQUISITES.md
docs/v14/INVENTORY-MAPPING.md
docs/v14/OPERATING.md
docs/v14/PIPELINE.md
docs/v14/PRODUCTION-ACCEPTANCE.md
docs/v14/PRODUCTION-INPUTS.md
docs/v14/REFERENCE-SEQUENCE.md
docs/v14/STYLE-CONSISTENCY.md
docs/v14/TAKES-LEDGER.md
docs/v14/TEST-MATRIX.json
docs/v14/TEST-MATRIX.md
docs/v14/UI-DEFECTS.md
docs/v14/research/AUDIO-VOICE-ARABIC.md
docs/v14/research/CRAFT-AGENTS-EVAL-TRENDS.md
docs/v14/research/IMAGE-STACK.md
docs/v14/research/PRIOR-MEASUREMENTS.md
docs/v14/research/TREND-SOURCES.md
docs/v14/research/VIDEO-ENGINES.md
e2e/coverage/00-chrome-tabs.spec.ts
e2e/coverage/01-navigation-home.spec.ts
e2e/coverage/02-shows-wizard.spec.ts
e2e/coverage/03-seasons-episodes.spec.ts
e2e/coverage/04-shorts-wizard.spec.ts
e2e/coverage/05-music-video-wizard.spec.ts
e2e/coverage/06-characters.spec.ts
e2e/coverage/07-locations.spec.ts
e2e/coverage/08-storyboard.spec.ts
e2e/coverage/09-production-page.spec.ts
e2e/coverage/10-settings.spec.ts
e2e/coverage/11-queue.spec.ts
e2e/coverage/12-review-exports.spec.ts
e2e/coverage/13-assets-players.spec.ts
e2e/coverage/14-mobile.spec.ts
e2e/coverage/15-rtl.spec.ts
e2e/coverage/16-keyboard-wizard.spec.ts
e2e/coverage/17-script-sound-frames.spec.ts
e2e/coverage/18-storyboard-kinds.spec.ts
e2e/coverage/19-shot-page-kinds.spec.ts
e2e/coverage/20-revise-forms.spec.ts
e2e/coverage/21-script-sound-kinds.spec.ts
e2e/coverage/22-overview-kinds.spec.ts
e2e/coverage/23-wizard-steps-cast.spec.ts
e2e/coverage/24-brief-duplicate-episode.spec.ts
e2e/coverage/25-location-layout.spec.ts
e2e/coverage/26-character-voices.spec.ts
e2e/coverage/27-frame-uploads.spec.ts
e2e/coverage/28-sound-and-song.spec.ts
e2e/coverage/29-show-and-season.spec.ts
e2e/coverage/30-music-video-shot.spec.ts
e2e/coverage/31-wizards-queue-home.spec.ts
e2e/coverage/32-board-and-review-kinds.spec.ts
e2e/coverage/33-episode-details.spec.ts
e2e/coverage/34-wizards-detail-review.spec.ts
e2e/coverage/35-asset-library.spec.ts
e2e/coverage/36-short-and-video-details.spec.ts
e2e/coverage/37-episode-board.spec.ts
e2e/coverage/38-remaining-details.spec.ts
e2e/coverage/39-lists-queue-home.spec.ts
e2e/coverage/40-mobile-shell.spec.ts
e2e/coverage/41-production-tabs.spec.ts
e2e/coverage/42-shot-pages.spec.ts
e2e/coverage/43-last-controls.spec.ts
e2e/helpers/a11y.ts
e2e/helpers/db.ts
e2e/helpers/env.ts
e2e/helpers/fixture-set.ts
e2e/helpers/fixtures.ts
e2e/helpers/pages.ts
e2e/helpers/record.ts
e2e/helpers/studio.ts
e2e/helpers/teardown.ts
e2e/inventory/crawl.spec.ts
e2e/inventory/fixtures.spec.ts
packages/agents/package.json
packages/agents/src/env.ts
packages/agents/src/errors.ts
packages/agents/src/index.ts
packages/agents/src/language.ts
packages/agents/src/loop.ts
packages/agents/src/provider.ts
packages/agents/src/roles/continuity.ts
packages/agents/src/roles/describe.ts
packages/agents/src/roles/direction.ts
packages/agents/src/roles/music.ts
packages/agents/src/roles/research.ts
packages/agents/src/roles/story.ts
packages/agents/src/roles/world.ts
packages/agents/src/shape.ts
packages/agents/src/style/anime.ts
packages/agents/src/style/cartoon.ts
packages/agents/src/style/index.ts
packages/agents/src/style/realistic.ts
packages/agents/src/style/types.ts
packages/agents/test/composition.test.ts
packages/agents/test/continuity.test.ts
packages/agents/test/fixtures.ts
packages/agents/test/loop.test.ts
packages/agents/test/music.test.ts
packages/agents/test/prompts.test.ts
packages/agents/test/provider.test.ts
packages/agents/test/research.test.ts
packages/agents/test/shape.test.ts
packages/agents/tsconfig.json
packages/config/package.json
packages/config/src/build.ts
packages/config/src/index.ts
packages/config/tsconfig.json
packages/contracts/package.json
packages/contracts/src/consistency.ts
packages/contracts/src/creative.ts
packages/contracts/src/index.ts
packages/contracts/src/production.ts
packages/contracts/src/vocabulary.ts
packages/contracts/test/consistency.test.ts
packages/contracts/tsconfig.json
packages/db/drizzle.config.ts
packages/db/migrations/0000_v14_initial.sql
packages/db/migrations/0001_operator_test_decisions.sql
packages/db/migrations/0002_acceptance_test_projects.sql
packages/db/migrations/0003_provisional_shot_values.sql
packages/db/migrations/0004_worker_build_provenance.sql
packages/db/migrations/meta/0000_snapshot.json
packages/db/migrations/meta/_journal.json
packages/db/package.json
packages/db/src/client.ts
packages/db/src/index.ts
packages/db/src/migrate.ts
packages/db/src/schema.ts
packages/db/tsconfig.json
packages/evaluation/package.json
packages/evaluation/src/audio.ts
packages/evaluation/src/ffmpeg-util.ts
packages/evaluation/src/frames.ts
packages/evaluation/src/index.ts
packages/evaluation/src/join.ts
packages/evaluation/src/motion.ts
packages/evaluation/src/record.ts
packages/evaluation/src/thresholds.ts
packages/evaluation/src/video.ts
packages/evaluation/test/audio.test.ts
packages/evaluation/test/frames.test.ts
packages/evaluation/test/helpers.ts
packages/evaluation/test/join.test.ts
packages/evaluation/test/motion.test.ts
packages/evaluation/test/record.test.ts
packages/evaluation/test/video.test.ts
packages/evaluation/thresholds.json
packages/evaluation/tsconfig.json
packages/inference/manifest/current.json
packages/inference/manifest/manifest-2026-09-23-0a74e731e9fb.json
packages/inference/manifest/manifest-2026-09-23-c95c8c93237b.json
packages/inference/manifest/manifest-2026-09-24-d6cc69fad040.json
packages/inference/package.json
packages/inference/scripts/refresh-manifest.ts
packages/inference/scripts/validate-workflows.ts
packages/inference/src/client.ts
packages/inference/src/index.ts
packages/inference/src/manifest.ts
packages/inference/src/validate.ts
packages/inference/src/workflow.ts
packages/inference/src/workflows/analysis.ts
packages/inference/src/workflows/audio.ts
packages/inference/src/workflows/image.ts
packages/inference/src/workflows/index.ts
packages/inference/src/workflows/ltx.ts
packages/inference/src/workflows/minimax-h3.ts
packages/inference/src/workflows/text.ts
packages/inference/src/workflows/wan.ts
packages/inference/tsconfig.json
packages/jobs/package.json
packages/jobs/src/gpu.ts
packages/jobs/src/index.ts
packages/jobs/src/queue.ts
packages/jobs/src/worker-instance.ts
packages/jobs/test/queue.test.ts
packages/jobs/test/tsconfig.json
packages/jobs/test/worker-version.test.ts
packages/jobs/tsconfig.json
packages/media/package.json
packages/media/src/ffmpeg.ts
packages/media/src/index.ts
packages/media/src/store.ts
packages/media/tsconfig.json
packages/studio/package.json
packages/studio/src/audio.ts
packages/studio/src/characters.ts
packages/studio/src/engine.ts
packages/studio/src/exports.ts
packages/studio/src/handlers.ts
packages/studio/src/hierarchy.ts
packages/studio/src/index.ts
packages/studio/src/kinds.ts
packages/studio/src/library.ts
packages/studio/src/locations.ts
packages/studio/src/readiness.ts
packages/studio/src/run.ts
packages/studio/src/settings.ts
packages/studio/src/songs.ts
packages/studio/src/story.ts
packages/studio/src/takes.ts
packages/studio/src/testing.ts
packages/studio/src/timing.ts
packages/studio/test/antecedent.test.ts
packages/studio/test/library.test.ts
packages/studio/test/readiness.test.ts
packages/studio/test/timing.test.ts
packages/studio/test/withdraw.test.ts
packages/studio/tsconfig.json
pnpm-workspace.yaml
scripts/checks/accept-short-script.ts
scripts/checks/backfill-concept-cast.ts
scripts/checks/bounded-acceptance.ts
scripts/checks/compose-short-frames.ts
scripts/checks/concept-probe.ts
scripts/checks/correct-engine-and-queue.ts
scripts/checks/decide-kian-v2.ts
scripts/checks/decide-short-refs.ts
scripts/checks/decision-role.ts
scripts/checks/drain-worker.ts
scripts/checks/draw-kian-v2.ts
scripts/checks/experiment.ts
scripts/checks/export-mechanics-test.ts
scripts/checks/figures-cli.ts
scripts/checks/figures.ts
scripts/checks/fix-kian-spec.ts
scripts/checks/masked-repair.ts
scripts/checks/measure-short-frames.ts
scripts/checks/pair.ts
scripts/checks/pipeline-comparison.ts
scripts/checks/pipeline-report.ts
scripts/checks/readiness-report.ts
scripts/checks/recompose-first-frame.ts
scripts/checks/redraw-kian-face.ts
scripts/checks/redraw-plates.ts
scripts/checks/redraw-shadow.ts
scripts/checks/reference-sequence.ts
scripts/checks/request-short-script.ts
scripts/checks/research-probe.ts
scripts/checks/resolve-facts.ts
scripts/checks/retry-failed-frames.ts
scripts/checks/retry-short-storyboard.ts
scripts/checks/review-held.ts
scripts/checks/script-probe.ts
scripts/checks/sequence-contact-sheet.ts
scripts/checks/series-context.ts
scripts/checks/settle-board.ts
scripts/checks/settle-cancels.ts
scripts/checks/settle-references.ts
scripts/checks/style-consistency.ts
scripts/checks/style-experiment.ts
scripts/checks/takes-ledger.ts
scripts/checks/tokenizer-probe.ts
scripts/checks/verify-framing-fix.ts
scripts/checks/worker-version.ts
scripts/design/shots.ts
scripts/inventory/build.ts
scripts/inventory/classify.ts
scripts/inventory/repoint.ts
scripts/inventory/stabilise.ts
scripts/inventory/test/stabilise.test.ts
scripts/studio.sh
tsconfig.base.json
```
