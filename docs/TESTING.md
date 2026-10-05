# Testing — the commands, the one regression suite, and when to run what

The rule: **focused tests while you work, the full suite at every integration checkpoint** (before a merge into
`main`, after a step of docs/IMPLEMENTATION-CHECKLIST.md lands, before an acceptance walk). Nothing here ever touches
the producer's studio: not its database `vewbox`, not its library, not the server on :4200 (src/server/test-guard.ts
refuses all three; docs/BACKEND-AUDIT-2026-10.md C3).

## The commands

| Command | What it runs | Needs |
|---|---|---|
| `pnpm typecheck` | `tsc --noEmit` over src, tests, scripts, the configs | — |
| `pnpm test` | the unit tests, `tests/unit/**` (vitest; no database, no library) | — |
| `pnpm test:api` | the HTTP-contract tests, `tests/api/**`, against a test server on :4210 (started for you on `vewbox_test`, the sample fixture loaded) | Postgres |
| `pnpm test:worker` | the queue and backup contracts, `tests/worker/**`, writing to `vewbox_test` and a scratch library | Postgres, ffmpeg, `pg_dump` for the backup drill |
| **`pnpm test:e2e`** | **the browser regression suite: every spec under `tests/e2e/v5`** against one isolated server on :4210, database `vewbox_e2e`, scratch library (below) | Postgres, ffmpeg, Chromium (`npx playwright install chromium`) |
| `pnpm e2e --project=desktop` / `--project=mobile` | the older reset-based suites at `tests/e2e/*.spec.ts` (each test resets the test studio to the sample fixture through the API) | as `test:e2e` |
| `node scripts/qa-journeys.mjs` | the wave-2 acceptance journeys (`tests/e2e/journeys`), real generation with `--gpu`; they bring their own server (`QA_JOURNEYS=1 pnpm test:server`, on `vewbox_test`) and the global setup then only checks that it is a test server | the worker, the GPU |

Focused runs while developing a page:

```powershell
pnpm test:e2e -- tests/e2e/v5/film.spec.ts            # one spec
pnpm test:e2e -- -g "the strip"                        # one test by title
pnpm test:e2e -- --headed --debug tests/e2e/v5/work.spec.ts
pnpm test -- tests/unit/film-model.test.ts             # one unit file
```

(`pnpm test:e2e -- <args>` forwards to `playwright test --project=v5`.) The global setup still seeds and warms the
server once per run, which costs about 30 s on a warm server; set `E2E_SKIP_SEED=1` to skip the seed while iterating
on a read-only spec.

An integration checkpoint is, in order: `pnpm typecheck`, `pnpm test`, `pnpm test:api`, `pnpm test:worker`,
`pnpm test:e2e` — all green, three consecutive green `test:e2e` runs when the suite itself changed. The CI workflow
(.github/workflows/ci.yml) runs the same five against a Postgres service.

## The browser suite (`pnpm test:e2e`)

One Playwright project, `v5` (playwright.config.ts), one worker, one server, one database, one scratch library. Its
global setup (tests/e2e/global-setup.ts), before any test:

1. **The database.** `vewbox_e2e` — `DATABASE_URL` (.env / .env.local / the shell) with its database renamed, or
   `E2E_DATABASE_URL` — is created when missing and migrated from `drizzle/` (never copied from the live `vewbox`;
   the guard refuses a live name). Its studio is then **replaced** with tests/fixtures/e2e/studio.json through the
   server's own seeding path (`replaceStudio('empty')`, then `persistState`), and the job history, the organisation's
   record, the proposal and the model registry are loaded from the same file. Every run starts from the same records,
   whatever the previous run (or a reset-based suite) left behind.
2. **The library.** A marked scratch folder (`%TEMP%\vewbox-e2e-library`, or `E2E_LIBRARY_ROOT`). The files the
   fixture's assets name are **copied, read-only, from the producer's library** (`LIBRARY_ROOT` of .env.local,
   resolved against this checkout or, in a git worktree, against the main checkout; or `E2E_SOURCE_LIBRARY`) — only
   files that are missing or of another size, so a second run copies nothing. A file the source does not have (another
   machine, CI) gets a **stand-in** of the same kind, shape and duration made with ffmpeg; subtitle texts travel inside
   the fixture. Nothing is ever written to the producer's library.
3. **The server.** `scripts/test-server.ts` on http://127.0.0.1:4210 with `VEWBOX_ALLOW_RESET=1`,
   `STUDIO_SAMPLE_FIXTURE=1`, that database and that library (its own build folder `.next-test`, so it runs beside a
   `pnpm dev` on :4200). A server already on :4210 is reused only if its `/api/health` reports `testServer: true`
   **and** `testDatabase: "vewbox_e2e"` — another suite's `pnpm test:server` (on `vewbox_test`) stops the run with a
   message, and the producer's studio can never be a target. `STUDIO_URL` points the suite at a server you run
   yourself, under the same two conditions.
4. **Warm routes.** Every page the specs open is fetched once, so the dev server has compiled it before a test waits
   on it (the first compile of a route can take 10–60 s on this machine; a test's own 90 s budget is for the test).
5. The server the setup started is stopped when the run ends (`test-results/e2e-server.log` keeps its output).

### Why this fixture, and the two ways the specs get their data

The page specs were written and accepted against the producer's studio of 2026-10-03: one finished film,
**"The Static Sky"** (`short-28bdb3342b`: two scenes, eight shots, fifteen takes, three cuts, an export with
subtitles), five characters (one with an Arabic name), one location, 73 jobs and the organisation's record. Several
specs name those ids and facts (work, theatre, film, ds1-focus, ds1-content, the create flow's Auto test), so the
database fixture **is** that slice, exported once with `pnpm test:e2e:fixture export` (read-only) and committed.
Choosing it kept every spec as it was; the alternative — rewriting them against the sample studio — would have
changed every expectation that names a shot, a cut or a line.

The specs that need the **sample studio** (shows, music videos, an episode's workspace, the shell, content-arabic)
do not read it from the database: they answer the browser's own GETs from scripts/v4-fixture.ts inside the page
(`prepare(page, { fixture })` of scripts/lib/capture.mjs) and answer every write there too. Both approaches coexist in
one run because neither touches the other's data.

**Writes.** Every spec routes its writes in the browser (`/api/commands`, `/api/jobs`, `/api/assets` are answered and
recorded, never sent) — except the theatre's notes, which go through the real notes routes and are reopened and
deleted again in `afterAll`; the next run's seed clears `cut_notes` regardless. So the database is the same after a
run as before it.

**Evidence.** ds1-focus, ds1-content and content-arabic write their crops and summaries under
`test-results/evidence/` by default; `E2E_EVIDENCE_DIR=docs/evidence/v5-ds1` refreshes the committed evidence on
purpose.

### Refreshing the fixture

When the film in the producer's studio changes on purpose (a new cut, a renamed character) and the specs follow:

```powershell
pnpm test:e2e:fixture export            # reads DATABASE_URL (.env.local) and LIBRARY_ROOT, read-only
git diff --stat tests/fixtures/e2e/studio.json
```

Review the diff (one record per line), run the suite three times, commit the fixture with the spec changes.
`--from <url>` and `--library <dir>` export from another studio; `apply` is what the global setup runs
(`pnpm test:e2e:fixture apply [--database <url>] [--library <dir>] [--source-library <dir>]`).

### Determinism rules for a spec

- Read from the fixture or the API; never from the clock or the machine (relative dates are not asserted).
- Wait for the thing you need (`expect(...).toBeVisible()`, `expect.poll`), never `waitForTimeout` to paper over a
  race; a dev-server chunk stall is fixed by the warm-up, not by a longer timeout.
- Unroute in `afterEach` (`page.unrouteAll({ behavior: 'ignoreErrors' })`): a snapshot still in flight when the test
  ends otherwise fails the test after its assertions passed.
- Order independence: a spec must pass alone (`pnpm test:e2e -- tests/e2e/v5/<name>.spec.ts`) and after any other.
- A phone test sets its own viewport (or `test.use({ ...devices['Pixel 7'] })` in a describe); there is no mobile
  project for v5.
- No retries in the config: a flaky test is a bug in the test or the page.

### The old v4 suites (tests/e2e/v4, removed 2026-10-04)

| File | Decision |
|---|---|
| f4-shell.spec.ts, f4-keyboard.spec.ts, f4-helpers.ts | **deleted** — they described the v4 shell (its sidebar groups and order, the 80 px rail at 834, `header.mobile-bar` and its sheet, `dialog.palette-dialog`, the `[data-save]` and `[data-stream]` status rows, `data-nav`, the room colour), which the Krea-reference shell replaced on 2026-10-03/04: 17 of their 20 tests fail against it for that reason, not for a defect. What holds for any shell survives in `v5/shell.spec.ts` (the skip link is the first stop and lands in `main`; axe serious/critical clean at 1440 and on a phone). A spec of the new shell's own keyboard order, search and phone menu is owed by the shell's owner once its design is approved. |
| content-arabic.spec.ts | **migrated** → `v5/content-arabic.spec.ts`, adapted: the profile's name is read from the element that holds it (a `<bdi>` isolate inside the English heading), the dialogue line from the episode's production workspace (`…/production?tab=story`, `[lang="ar"]` fields) |
| kit-keyboard.spec.ts, kit-helpers.ts | **migrated** → `v5/kit-keyboard.spec.ts`, `v5/kit-helpers.ts`: roving focus (TabBar, Segmented, ChoiceTiles) as they were; useConfirm/useAsk/Toast/contrast re-pointed at the v5 specimen (the "Confirm" and "Ask" openers, the 10 s action toast, the "More contrast"/"System" segments, the live `--text-2` token); the Dialog focus trap and MenuButton tests that `v5/kit.spec.ts` already covers dropped |
| f3-preview.spec.ts, f3-playerbar.spec.ts | **migrated** → `v5/kit-players.spec.ts` (the /kit players) |
| f3-keys.spec.ts, f3-helpers.ts | **migrated** → `v5/kit-edit-keys.spec.ts` (the cutting-room specimens; the dock's menu is the kit's "Layout: More"), minus the shelf test `v5/kit.spec.ts` covers |
| f4-evidence.spec.ts | **deleted** — not a test: screenshot captures of the v4 shell package for docs/evidence, run only with `F4_EVIDENCE=1`; the v5 acceptance scripts and scripts/capture-evidence.mjs make today's evidence |

Nothing in v4 reset the studio; the reset-based suites are the older `tests/e2e/*.spec.ts` (the `desktop` and
`mobile` projects), which keep running against the same test server and database — and the next `pnpm test:e2e`
re-seeds whatever they changed.

### Known findings the suite carries

None at the moment (2026-10-05, evening). The mechanism stays: `ds1-focus.spec.ts` keeps a `KNOWN` map of page/width
pairs that are expected to fail the pixel focus-ring gate (`test.fail`, with the finding as the reason); such a test
keeps measuring and writing its evidence under `test-results/evidence/v5-ds1/`, and when the page is fixed it
"unexpectedly passes" and fails until its entry is removed. The five pairs the suite carried on 2026-10-05 (Home's
shelf track clipping a card's ring at the column's edge; the short's credits names and, at 390, its strip and the
player's box clipping their rings; the "New character" split button hiding the ring between its halves) were cleared
the same day by the design system's fixes in the kit's focus rules (base.css, kit.css: 8 px of padding given back as
margin on the shelf track and the strip, `data-clips` on a clipping one-liner, `.iplayer` in the clip-margin rule, an
inset ring on a split button's parts). `home.spec.ts` was rewritten against the approved Home the same day and its
fixme removed.

Everything in the suite passes, and must keep passing.

## The per-page acceptance scripts

Each page package has its walk under `scripts/*-acceptance.mjs` (home, shows, film, music, cast, create, work,
theatre, studio): screenshots at three widths, measurements, and a JSON report under `docs/evidence/<page>-v1/`.
They were written against a server of their own (`--base http://localhost:4252…4261`); today they run against the
suite's server once it is up:

```powershell
pnpm test:server            # or let `pnpm test:e2e` start it; it stays up while the terminal lives
node scripts/film-acceptance.mjs --base http://127.0.0.1:4210
```

They are evidence tools, not gates: the gate is `pnpm test:e2e`.

## Troubleshooting

- *"The test server on http://127.0.0.1:4210 serves the database "vewbox_test"…"* — a `pnpm test:api` or
  `pnpm test:server` is still running; stop it (or let the API suite finish) and run again.
- *"Refusing to run the browser tests against …: it is not a test server"* — `STUDIO_URL` points at a server without
  `VEWBOX_ALLOW_RESET=1`, or on a live database. Unset it.
- *A route times out in the first test of a spec* — look at `test-results/e2e-server.log` for the compile; if a new
  page is not in the warm list, add it to `routesToWarm()` in tests/e2e/global-setup.ts.
- *`ffmpeg` not found during the seed* — only needed when the source library lacks a file (stand-ins); install it or
  point `E2E_SOURCE_LIBRARY` at a library copy.
- The e2e database can be dropped at any time (`drop database vewbox_e2e`); the next run recreates it. The scratch
  library likewise.
