# Contracts and ownership — character creation, appearance and voice identity (wave 2)

Decided by the Principal Architect on 2026-10-02 from the five research reports (`docs/research/UX-STRATEGY.md`,
`docs/DESIGN-SYSTEM-V2.md`, `docs/research/CHARACTER-VOICE-DIAGNOSIS.md`, `docs/research/CHARACTER-IMAGE-STACK.md`,
`docs/research/VOICE-STACK.md`). Every implementation agent works from this file. Where a report proposes more,
this file decides what lands now; the rest is backlog.

## 0. Rules for every agent

- Work in your own git worktree; commit on your branch with clear messages; never touch files outside your
  ownership list below (ask the architect through your final report instead). The architect merges.
- Do not stop or restart Docker services or the worker process; do not run GPU generation until the architect
  says the GPU is free (a MiniMax batch is running). Read-only use of the live dev server (:4200) and database
  (`docker exec vewbox-db-1 psql -U vewbox -d vewbox -At -c "<select>"`) is fine. Unit tests (vitest) are fine.
- `pnpm exec tsc --noEmit -p tsconfig.json` must pass on your branch; add unit tests for pure logic you change.
- Honesty: no placeholder media shown as results, no fabricated progress, no claim a model preserves identity or
  clones a voice beyond what was tested.

## 1. Decisions

### 1.1 Character creation (one page, three starts) — Frontend + Backend
- Starts: **Describe** (Auto: a line, or nothing but a name → `DESIGN_CHARACTER` fills the profile), **Write the
  sheet** (Manual: the minimum is name + style + language(+dialect); every other field optional, the agents fill the
  rest), **From a picture** (Reference: an uploaded image validated before any generation).
- Shared header for every start: *for* (production/show, optional), style, language, dialect (shown only for AR,
  default Iraqi Baghdadi).
- One orchestrating job **`CREATE_CHARACTER`** (new, Casting Director agent, CPU lane, maxAttempts 1) runs the chain
  and reports `step/total` with the real phases: design (DESIGN_CHARACTER, only when fields are missing) →
  appearance (CHARACTER_APPEARANCE) → reference sheet (CHARACTER_REFS) → voice (VOICE_BUILD, only when a voice
  reference exists or an automatic voice is available; otherwise the result says "no voice yet" and why). Children
  carry `parentId` and idempotency keys `create:${jobId}:${step}`; a restart adopts in-flight children (as PRODUCE).
  Partial success keeps the record: the result lists each step's outcome (`done` / `skipped(reason)` / `failed(class,
  message)`), the page shows them and offers the single recovery action per failed step.
- Payload (zod in `src/domain/jobs.ts`):
  ```ts
  CREATE_CHARACTER: {
    mode: 'AUTO' | 'MANUAL' | 'REFERENCE';
    name?: string; brief?: string;                       // AUTO: brief or name required
    profile?: Partial<CharacterProfileInput>;           // MANUAL: name required; REFERENCE: name required
    referenceAssetId?: string;                          // REFERENCE: required, validated (see 1.2)
    style?: Style; language?: Language; dialect?: Dialect; productionId?: string; showId?: string;
    voice?: { mode: 'NONE' | 'REFERENCE' | 'AUTOMATIC'; referenceSampleId?: string };
    draw?: boolean;                                     // default true: appearance + sheet after the record exists
  }
  ```
  Result: `{ characterId, steps: Array<{ step: 'design'|'appearance'|'sheet'|'voice'; status: 'done'|'skipped'|'failed'; jobId?; reason?; failureClass? }> }`.
- `CharacterProfileInput` is the diagnosis report's §3.1 shape, validated by zod in `src/domain/commands.ts`
  (per-command arg schemas for `addCharacter`, `updateCharacter`, `setPendingReference`, `addVoiceSample`,
  `selectVoiceSample`, `setVoiceIdentity`); malformed args → 400 `INVALID`, never 500.
- `updateCharacter` never writes `voice.identity`, `voice.samples` or `voice.selectedSampleId` (strip + guard); a
  language/dialect change on a character with an identity marks the identity `status: 'STALE'` (unused) or is
  refused with `VOICE_LOCKED` (used).
- After a successful creation the page opens the profile with a "just created" banner and the next-step chips.

### 1.2 Reference image validation — Image agent (server) + Frontend (presentation)
- `POST /api/assets` with `expect: IMAGE` and `purpose: 'character-reference'` returns the asset plus
  `validation: { ok, width, height, sharpness, faces: number, faceBoxHeight?: number, reasons: string[] }`
  computed on the CPU (`sharp` for size/sharpness; one face via `@vladmandic/human` on CPU — add the dependency only
  if its install is quick and offline-capable; otherwise size + sharpness only and say "face detection not
  available"). Rules: min side 512, exactly one face when detection runs, face box ≥ 18 % of height, not blurry.
  Stored on `character.pendingReference.validation`. `CHARACTER_APPEARANCE` refuses an unusable reference with
  `MISSING_REFERENCE` instead of silently drawing from text.
  *Wave-2 fix (review finding 2):* the upload route computes this on the CPU and stores it on the asset as
  `provenance.validation`; no face detector is installed, so `faces` is absent and `reasons` carries "face detection
  not available (size and sharpness only)" — never an invented count. `MISSING_REFERENCE` is a `StudioErrorCode`
  (HTTP 400, failure class `MISSING_REFERENCE`).

### 1.2a From a picture without a vision model (review finding 3)
- The story model (`qwen3:14b`) is text-only and no vision model is installed, so nothing may describe a picture
  nobody looked at. In REFERENCE mode the look fields (`face`, `hair`, `skin`, `eyes`, `build`, `wardrobe`) and the
  distinguishing marks are **not designed**: they stay empty unless the producer writes them, and empty means "as in
  the reference picture". `DESIGN_CHARACTER` runs only for who the character is (role, personality, sex/age from
  the producer's words or the name, voice description); the orchestrator marks the brief with
  `REFERENCE_LOOK_BRIEF` (`src/server/story/schemas.ts`), the one channel through the `DESIGN_CHARACTER` job.
- The portrait prompt names the person in the reference picture as the look and states only the fields the producer
  wrote (keeping the face only: the hair and clothes written on the Picture start are deliberate changes); the
  identity line persisted to `canon.identityLine` reads "… exactly as in the reference picture" plus the written
  tokens, so every later sheet, view and frame repeats the picture, not an invention. The portrait's provenance says
  `lookFrom: 'REFERENCE'`; the profile shows the empty look fields as "from the reference picture".
- **What a vision model would add** (backlog, needs a VLM in the story service — e.g. a Qwen2.5-VL / Qwen3-VL class
  model behind `story.structured_answer` with image input): read the validated picture (and the drawn portrait) and
  fill the look fields and distinguishing marks *from what it sees*, marked `source: 'VISION'` so the producer can
  tell seen from written; check sex/age presentation against the producer's words; give a face count and box height
  for the §1.2 face rules (with a detector); and compare the drawn portrait and sheet tiles with the reference
  (identity drift) before the sheet is accepted. Until then the picture itself is the only description.

### 1.3 Appearance and the reference sheet — Image agent
- Keep Qwen-Image-2512 / Qwen-Image-Edit-2511 (Apache-2.0). Implement from `CHARACTER-IMAGE-STACK.md` §4–5:
  `identityLine` (wardrobe/identity tokens) and `identitySeed` on the character (domain fields, persisted), the
  single-pass **identity sheet** (front / three-quarter / side / back drawn jointly from the portrait + face crop,
  quality mode), derived views with the fixed three-reference order, the stored seed, and the activity messages that
  say which references were actually used.
- Downloads allowed now (small, Apache-2.0): `mediapipe_face_fp32.safetensors` (5 MB) and the fal
  `Qwen-Image-Edit-2511-Multiple-Angles-LoRA` (295 MB) — add them to `docker/models/manifest.json` and fetch them into
  the `vewbox_models` volume with a one-off container (no fetcher image rebuild needed; document the command). Nothing
  larger in this wave.
- Identity check: DINOv2-small cosine on face crops is **backlog**; this wave records the references used, the
  seed, the model and the LoRAs in provenance and the Casting→Pre-Production handoff, and the Appearance tab shows
  the real sheet tiles with a "Redraw this view" action. No score badge until a measured check exists.
- GPU tests only when the architect confirms the GPU is free; until then, graphs must pass
  `node scripts/check-comfy-nodes.mjs` (needs the dev server) and unit tests of the graph builders.

### 1.4 Voice identity — Voice agent (engine, metrics, suite) + Backend agent (handlers, domain)
- **The reference is the upload, never a generated line.** `referenceWav` candidate order: `identity.referenceAssetId`
  → the selected sample only if `source === 'UPLOADED'` → any UPLOADED sample → refuse (`MISSING_REFERENCE`,
  message: upload a recording). GENERATED and SAMPLE sources are never cloned from. (Backend)
- `VOICE_BUILD` payload: `{ characterId, mode: 'REFERENCE'|'AUTOMATIC'|'MANUAL', referenceSampleId?, provider?,
  providerVoiceId? }`. REFERENCE clones from that validated upload; AUTOMATIC picks the best validated UPLOADED sample
  (the studio has no voice bank yet: when none exists it fails with `MISSING_REFERENCE` and the UI says what to
  upload); MANUAL is a MiniMax catalogue voice (hosted; `NOT_CONFIGURED` without a key). Idempotency key
  `VOICE_BUILD:${characterId}:${revision}`. (Backend)
- `VoiceIdentity` (domain) gains: `mode`, `referenceSampleId`, `referenceAssetId` (the ORIGINAL upload),
  `referenceWindow { from, to, assetId }` (the trimmed 24 kHz clip actually sent), `referenceText` (stored once),
  `params { speed, emotionAlpha, seed, nfe?, cfg? }`, `proof { sampleId, assetId, text, wer?, cer?, coverage?, heard? }`,
  `status: 'ACTIVE'|'REVIEW'|'STALE'`, `engineVersion`, `jobId`. `setVoiceIdentity` is the only writer and requires
  `proof`; it is written in the same command batch as the proof sample, **after** the audio exists; a failed build
  leaves the character unchanged. The proof line is added as a GENERATED sample but **never selected**. (Backend)
- Reference validation on upload: `POST /api/characters/:id/voice-reference` (multipart; or `POST /api/assets` with
  `purpose: 'voice-reference'` + a follow-up command — the Backend agent chooses and documents) returning the
  diagnosis report's `VoiceReferenceValidation` (duration 3–30 s, sample rate ≥ 16 kHz, LUFS −30…−10, true peak,
  speech present with ≥ 3 words by ASR, detected language) and refusing with `TOO_SHORT | TOO_LONG | NO_SPEECH |
  TOO_QUIET | CLIPPING | WRONG_LANGUAGE | BAD_FORMAT`. The trimmed window is chosen at a silence boundary (≤ 12 s,
  speech-active region, not the head of the file) with a **static** gain to −20 LUFS (two-pass loudnorm or
  measured gain), 24 kHz mono. The ASR transcript is stored as `VoiceSample.text`. (Backend owns the endpoint and the
  trimming in `voice.ts`; Voice agent owns the measurement helpers in `src/server/providers/speech.ts` / a new
  `src/server/media/voice-check.ts`.)
- Engine output: `docker/tts/app.py` applies a peak limiter (true peak ≤ −1 dBTP, no clipping) to both engines
  before writing PCM-16, accepts `seed`, `speed`, `nfe_step`, `cfg` (Habibi) and reports the engine version in the
  response headers; `speech.ts` sends `seed` and params and records them. (Voice)
- Routing parity: the engine and the ASR language follow the **line's script** (Arabic script → the character's
  Arabic engine; Latin-only → IndexTTS; mixed → IndexTTS with a job event naming the fallback), identical in
  `voice.ts`, `take.ts` and the suite. The identity's `model` is never changed by a fallback. (Backend for handlers,
  Voice for the suite)
- Metrics: keep WER for reporting; gate on **coverage ≥ 0.7 (takes) / 0.85 (recorded lines)** and **CER ≤ 0.15**
  after an Arabic dialect fold (گ↔ق/ك, چ↔ج/ك, ـه/ـة, ى/ي, hamza forms, diacritics, Iraqi spellings table). `verifyLine`
  on an ASR outage marks the line `REVIEW` (never passes it silently). (Voice owns `speech.ts` metrics; Backend applies
  them in handlers.)
  *Wave-2 fix (review findings 7, 9, 20):* one measurement stack — `src/server/media/voice-check.ts` measures
  provenance, format, level, clipping (samples counted at full scale, not guessed from the true peak) and the window,
  and trims with a static gain measured on the mono 24 kHz cut; `src/server/studio/voice-reference.ts` keeps only the
  speech judgement (`heardSpeech`, `judgeSpeech`) and composes the two; the stored record is the domain's
  `VoiceReferenceValidation`. A file carrying docker/tts's synthetic-speech tag (ISFT/ICMT → ffprobe
  `encoder`/`comment`) is refused `BAD_FORMAT` at upload and `MISSING_REFERENCE` if it reaches a build another way.
  Journey 06 needs an authorised recording (`tests/fixtures/voice/iraqi-reference.wav` + consent note) and skips
  with that reason until one exists.
  *Wave-2 fix (review findings 4, 5):* one routing rule — `lineScript`/`routeLine` in `speech.ts` (punctuation and
  digits are not script, so «،» does not flip an English line; a mixed line is heard in the language most of its
  letters are in); `voice.ts` routes through a thin adapter that adds the pinned engine, and the suite calls the rule
  directly. The gate is `judgeHeard`/`verifyLine` in `voice.ts` over `verdict()`: PASS needs coverage AND CER; FAIL is
  regenerated once (`shouldRegenerate`), REVIEW is flagged for a person; `proof.cer` is recorded and the take's QA
  report carries a `character-error-rate` row.
- Dialogue reuse: a take records a line only when `d.audioAssetId` is missing or stale (identity revision changed);
  recorded lines are written back with `setDialogueAudio`; the take's soundtrack is joined from the stored lines.
  (Backend)
- Consistency measure (ECAPA speaker similarity) is **backlog**: it needs a dependency in the asr image.

### 1.5 Iraqi Arabic — Voice agent
- Fix the suite (`scripts/iraqi-voice-suite.mjs`): reference transcribed with `language: 'auto'`, routing parity,
  loudness/peak/CER/coverage columns, labelled files; the reference set must be **real authorised recordings**, not
  synthesised clips (the two clips used today are engine output — state this in the report and in the evidence).
  Phase 2 (GPU free): run the extended suite, publish `docs/evidence/iraqi-suite.md` with the labelled samples and
  the "subjective quality pending review" status for dialect authenticity.

### 1.6 Locks — Backend
- Appearance and voice locks as implemented (`rules.ts`), plus: `updateCharacter` guard (1.1), `deleteAsset` refuses
  `identity.referenceAssetId` of a used character, lock reasons surfaced in `GET /api/studio` through the existing
  `usage` record. The frontend shows the lock in the hero, on the Appearance tab and on the Voice tab with the reason
  and the videos.

### 1.7 Assets — Backend
- `assets.unavailable` persisted (migration), set by `MEDIA_PROBE`/the file sweep; the UI reads it.

### 1.8 Frontend — Frontend agent, from `DESIGN-SYSTEM-V2.md` and `UX-STRATEGY.md`
- Priority 1: the character-creation page (three starts, shared header, preflight, `JobProgress` with the real
  phases, result panel, failure recovery, profile handoff with banner), the Characters directory (portrait wall),
  the character profile (hero with lock state, Appearance tab with the sheet tiles and "Redraw this view", Voice tab
  with the identity card first, validated upload with measured badges, previews, the lock notice), the voice
  reference dropzone with browser-measured duration and the server validation reasons.
- Priority 2: design-system v2 tokens and components (`globals.css` tokens, `Hero layout="wide"`, `JobProgress`,
  `PhaseStrip`, `ImagePreview`, `notice-gold`, sticky tabs), the navigation groups (primary five; Library:
  Locations, Files; Studio: Production, Settings), manual show creation landing on the show page, the show page
  without the triple season listing, Production page "Needs your decision" first.
- Priority 3: music-video page additions, settings polish.
- API calls use the shapes in this file; while the backend branch is unmerged, code against the types in
  `src/domain/*` as they will be (the Backend agent lands them first and the architect merges backend before
  frontend).

## 2. Ownership (files)

| Agent | Owns (may edit) | Must not edit |
|---|---|---|
| Backend | `src/domain/{types,actions,commands,rules,jobs}.ts`, `src/server/studio/*`, `src/server/db/schema.ts` + `drizzle/*`, `src/server/jobs/*`, `src/worker/handlers/{character,voice,take,produce,story}.ts` (voice.ts: handlers + `referenceWav`), `src/app/api/{commands,jobs,assets,characters}/**`, `src/server/org/model.ts` (new job types/agents), `tests/unit/*`, `tests/api/*`, `tests/worker/*` for its scope | `docker/*`, `src/server/providers/speech.ts`, `src/server/workflows/*`, `src/worker/handlers/images.ts`, UI components |
| Voice | `docker/tts/app.py`, `src/server/providers/speech.ts`, `src/server/media/voice-check.ts` (new), `scripts/iraqi-voice-suite.mjs`, `docs/evidence/iraqi-suite*`, `skills/iraqi-dialogue`, `skills/audio-first-dialogue`, `tests/unit/{script-coverage,voice-metrics}*.test.ts` | `src/worker/handlers/*`, `src/domain/*`, UI |
| Image | `src/server/workflows/*`, `src/worker/handlers/images.ts`, `src/server/media/image-check.ts` (new), `docker/models/manifest.json`, `scripts/check-comfy-nodes.mjs`, `docs/MODELS.md`, `skills/world-continuity`, `tests/unit/*workflow*.test.ts`; may add `identityLine`/`identitySeed`/`CharacterRef.view` fields to `src/domain/types.ts` (append only, coordinate in the report) | `src/worker/handlers/{voice,take}.ts`, UI, `docker/tts` |
| Frontend | `src/app/(app)/**`, `src/components/**`, `src/studio/{org.ts,api.ts}`, `src/lib/{i18n,format,hooks}.ts`, `src/app/globals.css`, `tests/e2e/*` (UI specs only) | `src/domain/*` (type-only reads), `src/server/*`, `src/worker/*`, `docker/*` |
| QA | `tests/e2e/journeys/*.spec.ts` (new folder), `tests/e2e/helpers.ts` (additive), `playwright.config.ts` (a `journeys` project with long timeouts), `scripts/qa-*.mjs`, `docs/TEST-RESULTS.md` | application code |
| Reviewer | `docs/REVIEW-WAVE2.md` only | everything else |

## 3. Integration order

1. Backend (domain types, commands, jobs, voice handlers, dialogue reuse, assets.unavailable) → merged first.
2. Voice (engine limiter, metrics, suite) and Image (workflows, images.ts, validation) → merged next; conflicts in
   `voice.ts` are between `referenceWav` (Backend) and nothing of Voice's — Voice does not edit `voice.ts`.
3. Frontend → merged last against the final types.
4. QA journeys run on the merged main with the GPU free; Reviewer reads the merged result.
