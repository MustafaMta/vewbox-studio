# Test results

Latest runs on the reference machine (Windows 11, RTX 5090, Docker Desktop/WSL2; web and worker on the host with
hot reload against the Docker database and local story engine). Dated 2026-10-02.

| Suite | Command | Result | Notes |
|---|---|---|---|
| Unit | `pnpm test` | **48 / 48** | reducers and rules (28), command engine (4), tolerant story schemas (3), access gate (3), timeline (4), ACE-Step workflow inputs (3), music-video performer rule in take prompts (3) |
| API (live) | `pnpm test:api` (also with `STUDIO_URL=http://127.0.0.1:4300` against the production web container) | **22 / 22** (both) | contracts (13): health, snapshot hash, batch atomicity, APPEARANCE_LOCKED 409, uploads probed and served with Range, protected delete 423, jobs + idempotency, event stream, reset; negative (9): truncated MP4, SVG with script, empty/no-file/non-multipart, hostile media ids, take without an engine fails honestly, wrong payloads, cancel/retry states, atomic batches, oversized batches |
| Worker (live DB + ffmpeg + audio service) | `pnpm test:worker` | **15 / 15** | stale lease reclaimed by a second worker, backoff, non-retryable, idempotency, cancel flag, backoff curve; MiniMax client: missing key → NOT_CONFIGURED, wrong key against the real api.minimax.io → terminal PROVIDER error; media toolchain on real files: take QA accepts/rejects by named check, truncated decode, web-ready + poster, loudness, trim |
| Browser (Playwright) | `pnpm e2e` | **54 / 54** (latest run 5.2 min with two real story-engine proposals; earlier clean run 2.3 min) | desktop (53) + phone (1); includes two real Auto Idea proposals written by the local model, Arabic/RTL shell, uploads of real media, reset, jobs in Activity, the continuity rule end to end |

Bugs these runs found and fixed (details in `IMPLEMENTATION-CHECKLIST.md`): reset request aborted by navigation
(writes are now `keepalive`); jobs and settings leaking between tests (reset clears job history; tests reset
settings); external font requests failing on a slow link (fonts self-hosted); stale "kept in this browser" copy; a
fake-audio fixture the server rightly refused (real fixtures under `tests/fixtures`); worker crash when a reset deleted
a job it was finishing; NOT_CONFIGURED masked as a retryable provider error; SVG uploads accepted.

Earlier history: the first E2E run after the backend landed was 41/54, the second 49/54, the third 54/54.

## Wave 2 journeys

Independent acceptance tests for the product owner's character and voice scenarios (`docs/CONTRACTS-CHARACTER-VOICE.md`),
written as Playwright specs under `tests/e2e/journeys/` against the REAL interface, with every verdict checked a
second time in `GET /api/studio`, the jobs API and (where noted) the database rows. **Not run yet**: they reset the
live database before every test and the `@gpu` ones generate for real; the architect runs them on the merged main
once the GPU is free (contract §3.4). Status: *written, compiles (`pnpm exec tsc --noEmit -p tsconfig.json`), 17 tests
listed with `QA_GPU=1`, 9 without.*

**How to run.** `node scripts/qa-journeys.mjs --yes [--gpu] [--restart] [--base URL] [--grep <regex>] [--headed]`.
The script checks `/api/health` and prints `/api/status` (which engines are ready), warns about active jobs, clears
the restart flags, then runs the `journeys` Playwright project (`QA_JOURNEYS=1`; the project does not exist for a
plain `pnpm e2e`, so the existing suites are unchanged). Timeouts: 20 min per test, 30 s per expectation, serial, one
worker, trace + video kept on failure. Evidence: `docs/evidence/qa/*.png`, `playwright-report/journeys/`, `test-results/`.

**Preconditions.** Web (`pnpm dev`) and the worker (`pnpm worker`) running against the Docker database; ffmpeg on the
runner (fixtures are scaled/re-tempoed on the fly). `@gpu` tests additionally need `--gpu` **and** the engines reported
ready by `/api/status` (story + images for creation, voice + transcription for voices, video — MiniMax — for the take);
a test whose engine is down is *skipped with the reason*, never passed. Test 9 needs `--restart` and an operator.
Test 9's API-only variant and Test 1's row count need `docker exec vewbox-db-1 psql` reachable from the runner
(`QA_DB_CONTAINER` overrides the name); otherwise that check is skipped and says so.

| # | Spec | Needs | What it drives and asserts |
|---|---|---|---|
| 1 | `01-automatic-creation` `@gpu` | story, images | `/characters/new` → *Describe them* with a name only → *Design character*. Finds the `CREATE_CHARACTER` job (mode AUTO) through the jobs API, waits ≤ 16 min; `result.steps` = design/appearance/sheet `done`, voice `skipped` with a reason naming the missing reference; every child job (`parentId`) COMPLETED, no `VOICE_BUILD` started, `step/total` reported. Profile opens with the banner; portrait and every ref are `sample:false`, `bytes>0`, `origin GENERATED`, served 200, decoded in the page (no `/api/media` response ≥ 400); each ref has a `view` label; exactly one new character (API count +1 and `select count(*) from characters`). |
| 2 | `02-manual-creation` | — | *Write the sheet*: name, Arabic name, role line, style Cartoon, language AR + dialect Iraqi Baghdadi, sex Male, hair, wardrobe → *Create* (record only). The stored character equals the inputs field by field; no portrait, no identity, `usage.known` true and empty. Second test: the empty name is refused before anything is sent. |
| 3 | `03-reference-creation` | — / images | (a) API: `POST /api/assets` `expect:IMAGE purpose:character-reference` with a 100×100 plate is refused (or `validation.ok:false`) with a reason naming 512; the 768×960 plate returns `validation {width,height,sharpness,faces,reasons}`. UI on Nour's Appearance tab: the small one is refused in place and nothing is recorded; the usable one shows *Your reference*, `pendingReference.validation` (768×960) is stored, the portrait is untouched, it survives a reload. (b) `@gpu`: *From a picture* on the creation page → `CREATE_CHARACTER` mode REFERENCE carrying the upload id → portrait drawn, provenance names the reference, the upload stays in the library. |
| 4 | `04-appearance-regeneration` `@gpu` | images | Nour (unused): *Regenerate appearance* → `CHARACTER_APPEARANCE` completes, new real portrait with `jobId`, **every previous picture still recorded and served 200**, the page shows the new one. Then *Redraw this view* on a sheet tile (draws the sheet first if the sample has none) → `CHARACTER_REFS` with one role, one new view asset, sheet size unchanged, previous assets kept, portrait untouched. |
| 5 | `05-voice-generation` `@gpu` | voice, transcription | Fresh EN character; `tests/fixtures/speech-en.wav` through the Voice tab dropzone (probed duration > 5 s, transcript stored on the sample) → *Build the voice* → `VOICE_BUILD` completes. `identity.proof {sampleId, assetId, text}` present, `identity.referenceAssetId` = the upload, revision 1, status ACTIVE/REVIEW; the proof sample is GENERATED and **not** selected; the selected sample is the UPLOADED one. Play on the identity card → the shared `<audio>` loads the proof asset with `duration > 0`. |
| 6 | `06-iraqi-voice` `@gpu` | voice (Habibi), transcription | AR/Iraqi character built from `docs/evidence/iraqi-suite/male-long.wav` — **engine output, not an authorised recording** (annotated in the report); only intelligibility is asserted. *Preview a line* «شلونك حبيبي، شخبارك؟» → `VOICE_PREVIEW` routed to Habibi; `result.check.heard` coverage ≥ 0.85 (the server's `coverage` when present, else the test's own dialect fold in `helpers.ts`), CER ≤ 0.15 soft; the preview never becomes the selected voice; the audio plays with a real duration. |
| 7 | `07-voice-regeneration` `@gpu` | voice, transcription | Build from `speech-en.wav` (rev 1), upload a second recording (same speech at 0.9× tempo, different sha256), select it, rebuild → a second `VOICE_BUILD`, `identity.revision` 2, `referenceAssetId` = the new upload, a new proof asset; **the first proof asset still exists and is served**; the selected sample is the new upload, both proof lines listed and unselected. |
| 8 | `08-identity-locking` `@gpu` / — | video (MiniMax) | Nour gets a chosen recording, is cast in a new one-shot short (commands API), *Generate video* from the shot editor → `GENERATE_TAKE` completes (≤ 12 min), `usage.videos` names the short/shot/take. UI: lock notice, *Regenerate appearance* disabled with `aria-describedby`, Voice tab notice, *Build the voice* disabled, other samples not selectable. API: `setCharacterAppearance` → APPEARANCE_LOCKED, `selectVoiceSample` → VOICE_LOCKED, `updateCharacter {hair}` → APPEARANCE_LOCKED, each with HTTP 409/423 and nothing applied. The second test repeats the API refusals on Layla (sample, already used) without any generation. |
| 9 | `09-persistence-restart` | operator (`--restart`); docker psql | Creates a character with a validated pending reference and a chosen uploaded recording, records the projection (characters, assets {bytes, sha256, …}, identities, usage, settings, version), then **`requireRestart()`** (below). After the restart: identical projection, same version, files served with the recorded byte length, job history intact, a `MEDIA_PROBE` runs to COMPLETED on the restarted worker. API-only variant (no restart): `docker exec vewbox-db-1 psql` reads `characters` (name, language, dialect, hair, wardrobe, `pending_reference`, `voice`, `usage_known`), `assets` (bytes, sha256, sample, origin, size) and `character_usage` rows and compares them with the API. |
| 10 | `10-premium-ux-walk` | — | Shows, Shorts, Music Videos, Characters, Studio Company at 1440/1024/768/390, in EN and AR (`updateSettings {uiLanguage}` through the commands API): heading present, `dir`/`lang` correct, sample content listed, **no console errors** (fixture), `scrollWidth ≤ innerWidth + 1`, screenshots `docs/evidence/qa/ux-<page>-<lang>-<width>.png`; at ≥ 1024 the primary nav has the five links in order and Tab moves through them in order with a visible outline, Enter opens the area; below that the mobile menu lists them. A third test screenshots the Layla profile, Nour's Voice tab and the creation page at 390 px in both languages. |

**Operator steps for Test 9** (`node scripts/qa-journeys.mjs --yes --restart --grep "restarts web"`):
1. The test creates its content and writes `var/qa-restart-requested.flag`; the console prints `>>> OPERATOR: restart web + worker now`.
2. Stop and start the web server (`pnpm dev`) and the worker (`pnpm worker`) — not the Docker database.
3. When `/api/health` answers again, create the flag: `New-Item var/qa-restarted.flag` (any content; it must be newer than the request).
4. The test resumes within 2 s, waits for health, compares, and removes both flags. The wait is bounded by `QA_RESTART_WAIT_MS` (default 30 min).

**Helpers added** (`tests/e2e/helpers.ts`, additive): `send`/`act` (commands API with seeds), `createCharacter`, `startJob`/`getJob`/`listJobs`/`findJob`/`childrenOf`/`waitForJob`/`jobOutcome`/`isType`/`payloadOf`, `uploadAsset` (+ `expect`/`purpose` fields), `fixture`/`scaledPlate`/`audioVariant` (ffmpeg), `media`/`expectRealAsset` (200, bytes > 0, never sample), `engineStatus`/`requireEngines` (skip with the reason), `requireRestart`, `psql`, `arabicFold`/`coverage`/`characterErrorRate`, `waitForApp`/`overflowPx`/`expectAudioLoaded`/`setUiLanguage`/`evidencePath`/`control`, and the `WAIT` ceilings (portrait 4 min, sheet 8, voice 6, take 12, whole creation 16).

**Selectors blocked on final copy.** Where the design spec or UX strategy leaves the words open, the specs use
role + regex and carry a `// TODO(copy)` comment: the three start cards (*Describe them / Write the sheet / From a
picture*), *Design character* / *Design from picture* / *Create* vs *Create and draw*, the stepper phase names, *Open
profile* and the *Just created* banner, *No voice yet / Add a voice*, the *Details* disclosure and the role-line label
on the Manual sheet, the validation badges (`768 × 960`, duration), *Redraw this view* / *Draw reference views*,
*Build the voice* / *Rebuild the voice*, the identity card's region name and engine words, *Verified / Needs a
listen*, *Latest preview*, the lock pre-warning on *Generate video*, the mobile menu button. UI assertions on that
copy are `expect.soft` so a wording change is reported without hiding the persistence verdict; the API and database
assertions are hard.
