# Character creation and voice identity — diagnosis

Read-only diagnosis of the live studio (2026-10-02, `studio_meta.version` 1706, 4 characters, 132 assets, 12 character/voice jobs, all `COMPLETED` on attempt 1).
Evidence comes from the code (file:line), the Postgres container `vewbox-db-1`, `GET /api/studio`, and `var/worker-detached.log`.
No source file was modified.

## 1. The lifecycle as it runs today

### A. Manual creation (form)
1. `src/app/(app)/characters/new/page.tsx:55` renders `CharacterForm` (manual tab); the auto tab (`:35`) starts a `DESIGN_CHARACTER` job instead.
2. `src/components/character/CharacterForm.tsx:34` validates **only** `name.trim()`; `:35` coerces `ageYears` with `Number(x) || 1`, defaults `sex` to `'FEMALE'` (`:22`), `dialect` to `settings.defaults.dialect` and drops it for EN.
3. `:40` → `act('addCharacter', {...base, voice:{pitch,pace,timbre,notes}})`.
4. `src/studio/store.tsx:129-134` runs the reducer locally (optimistic), pushes the command to `pending`, flushes after 120 ms (`:127`).
5. `src/studio/api.ts:30-34` → `POST /api/commands`; `src/app/api/commands/route.ts:11` validates the envelope only (`args: z.array(z.unknown())`).
6. `src/server/studio/engine.ts:23-49`: advisory lock, `loadSnapshot`, `runCommand` per command, `persistState`, bump `studio_meta.version`, `NOTIFY`.
7. `src/domain/actions.ts:308-313` `addCharacter`: name check, `usage:{known:true,videos:[]}`, `voice.samples:[]`, `refs:[]`.
8. `src/server/studio/persist.ts:178-180` → row in `characters` (`voice` jsonb, `refs` jsonb, `usage_known`); `src/server/studio/snapshot.ts:93-97` reads it back verbatim (no normalisation).
9. Browser: `store.tsx:104-108` compares `r.hash` to `hashState(local)`; mismatch → `refresh()`; `ok:false` → `:110-114` raises one toast and drops the batch.

### B. Auto creation (Casting)
10. `src/worker/handlers/story.ts:62-78`: LLM design validated by the zod schema at `src/server/story/engine.ts:164-167` (sex/age/voice enums) → `command('addCharacter')`, then `updateProduction/updateShow` castIds. Three separate commands, no transaction.

### C. Appearance
11. Reference picture: `CharacterPage.tsx:105-115` → `/api/assets` (`src/server/media.ts:117-136` sniff + ffprobe) → `act('setPendingReference')` (`actions.ts:328-332`).
12. `CHARACTER_APPEARANCE` (`src/worker/handlers/images.ts:67-82`): `canChangeAppearance` → `requireComfy` → `draw()`; `:42` silently drops references that fail `usable()`; `:79` `setCharacterAppearance` with `refs:[FACE]` and `keepExistingRefs:false` → `actions.ts:336-341` replaces every previous ref.
13. `CHARACTER_REFS` (`images.ts:86-113`): 5 views from the portrait → `addCharacterRefs` (`actions.ts:344-349`, dedup by role).
14. Manual views: `CharacterPage.tsx:117-124` → `updateCharacter({refs, portraitAssetId})` with any image.

### D. Voice
15. Upload: `CharacterPage.tsx:213-221` (`file.type.startsWith('audio/')` only) → `/api/assets` → `act('addVoiceRecording')` (`actions.ts:361-363`, source `UPLOADED`, not selected).
16. `VOICE_BUILD` (`src/worker/handlers/voice.ts:82-121`): `referenceWav` (`:33-43`: candidate order = selected sample → uploaded → any; ffmpeg `-ss 0.2 -t 12`, mono 24 kHz, single-pass `loudnorm`) → `setVoiceIdentity` (`:103`, **before** any audio is produced) → proof line (`:105`) → `speakLine` (`:56-72`) → `verifyLine` (`:75-80`) → `addAsset` + `addVoiceSample(..., select=true)` (`:113`) → QA report (`:118`).
17. Engine routing: `src/server/providers/speech.ts:36-40` (`AR+IRAQI_BAGHDADI` → habibi, else indextts); `voice.ts:68-69` forces indextts for mixed-script lines; Habibi gets `reference_text` from a fresh Whisper pass each job (`voice.ts:47-54`).
18. `docker/tts/app.py:166-198`: `/synthesize` checks only `len(data) >= 1000` bytes; IndexTTS `duration_factor = 1/speed` (`:85`); emotion from English keywords (`:56-63`); Habibi `preprocess_ref_audio_text(ref, ref_text or "")` (`:120`).
19. Dialogue: `DIALOGUE_AUDIO` (`voice.ts:142-179`) writes `setDialogueAudio`; but `GENERATE_TAKE` (`src/worker/handlers/take.ts:74-105`) re-speaks every line per take and never calls `setDialogueAudio` (no `audioAssetId` reference in take.ts).
20. Locks: `src/domain/rules.ts:17` (`APPEARANCE_KEYS`, voice not included), `:54-66` (`voiceLock` only when identity or selected sample exists).

## 2. Defects

| ID | Symptom | Root cause and evidence | Sev | Proposed correction | Owner |
|---|---|---|---|---|---|
| V1 | Every dialogue line in every take is cloned from the 3-second synthetic proof line, not from the producer's recording: voices drift, sound thin, "sound wrong" | `voice.ts:113` adds the proof line with `select=true`; `referenceWav` (`voice.ts:36`) takes `selectedSampleId` first and ignores `identity.referenceAssetId`. DB: all 4 characters have `selectedSampleId` = the GENERATED sample (`voice-10ab4a960f` → `gen-aabcfa7e28`, 3.31 s; Layla's is 2.33 s) while `identity.referenceAssetId` = the upload (`up-30064319e6`, 6.78 s). 17 orphan `… soundtrack (dialogue)` assets were produced by takes from that reference | Critical | `referenceWav` must resolve `identity.referenceAssetId` first and refuse GENERATED samples as a clone source; `VOICE_BUILD` must not auto-select the proof line (keep it as `GENERATED`, mark the uploaded sample as the identity reference) | Voice |
| V2 | Habibi reference transcript is re-run through Whisper (`language:'auto'`) on every job; clone quality varies per job; a mistranscribed reference degrades F5 conditioning | `voice.ts:47-54` caches in a per-job object; `VoiceSample.text` is never filled for uploads; `agent_runs` for both Habibi builds show `speech.transcribe → speech.synthesize → speech.transcribe` | High | Transcribe once at upload (or accept a producer transcript), store `VoiceSample.text` + `VoiceIdentity.referenceText`; pass that to `/synthesize` | Voice |
| V3 | A failed `VOICE_BUILD` leaves an identity with no sample; revision increments on every retry; a used character then becomes permanently `VOICE_LOCKED` with a broken identity | `voice.ts:103` pins the identity before synthesis; `:88` + `actions.ts:374` guard on `identity` existing; no compensation on failure | High | Pin identity only after the proof line is stored, in one command (`setVoiceIdentity` carrying `sampleAssetId`); on failure leave the character untouched | Backend/Voice |
| V4 | Mismatch between the production's language and the character's engine: an Iraqi character in an EN production is sent English text to Habibi (no English model) → noise; an AR line to an EN-pinned identity goes to indextts `lang=AR` with an English reference | `voice.ts:159`/`take.ts:83` pick text by `p.language`; `speakLine:69` picks the engine by `c.language`/`identity.model`; `verifyLine` uses `c.language` for ASR | High | Decide `lineLanguage` per line (script detection + production language); refuse or route to the bilingual engine when `lineLanguage ≠ identity.language`; verify with the line's language | Voice |
| V5 | Changing a character's language/dialect in the form never invalidates the identity (`identity.language`, `identity.model` stay); engine routing then follows the stale pin | `updateCharacter` (`actions.ts:318-324`) has no voice-consistency rule; `rules.ts:17` excludes voice from guarded keys | Medium | In `updateCharacter`, when language/dialect change and an identity exists: refuse if voice-locked, else clear identity (revision bump, `status:'STALE'`) | Backend |
| V6 | `updateCharacter` can overwrite `voice` wholesale (identity, samples, selection) without `guardVoiceChange`; the voice lock is bypassable from any client | `actions.ts:318-324` only runs `guardCharacterPatch` (appearance keys); `CharacterForm.tsx:37` sends the whole `voice` object; `route.ts:11` validates nothing inside `args` | High | Strip `voice.identity/samples/selectedSampleId` from `updateCharacter` patches (dedicated commands only); add per-command zod schemas on the server | Backend |
| V7 | Mixed-script lines switch engine (habibi → indextts) mid-scene: the same character has two timbres | `voice.ts:68-69` overrides the pinned model; identity has no secondary engine | Medium | Record `identity.fallbackModel`; prefer splitting the line (Arabic part → habibi, Latin part → indextts) or transliterating Latin tokens; log the switch as a job event | Voice |
| V8 | Pace/pitch/timbre from the profile never reach synthesis; emotion/delivery never reaches dialogue; Arabic delivery words never match | `voice.ts:71` `speed: 1.0` constant; `voice.ts:162`/`take.ts:85` call `speakLine` without `delivery`; `app.py:56-63` matches English keywords only; `ShotDialogue` has no `delivery` field (`types.ts:146`) | Medium | Map `voice.pace` → speed (0.9/1.0/1.12); carry `delivery` from `Line` to `ShotDialogue`; map AR delivery words; expose `emotionAlpha` | Voice/Backend |
| V9 | `referenceAssetId` in the `VOICE_BUILD` payload is accepted (`jobs.ts:88`) and ignored | `voice.ts:83` destructures only `characterId, provider` | Medium | Honour it (validate it is an `UPLOADED` AUDIO asset of this character) or remove it from the schema | Backend |
| V10 | No validation of the voice reference: any audio of any length (0.1 s or 10 min), stereo, music, silence, 8 kHz passes; the service only checks `>= 1000 bytes` (`app.py:177`); `-t 12` hard-cuts mid-word (`voice.ts:41`) | `media.ts:117-136` probes format only; `addVoiceRecording` has no rule; preflight `speakers-have-voices` (`preflight.ts:56`) accepts any non-sample audio | High | Validated upload contract (section 3.2): 3–30 s, speech present (ASR word count ≥ 3, or VAD), integrated loudness within −30…−10 LUFS, peak < −1 dBTP, mono-downmixable; trim to ≤12 s at a silence boundary, two-pass linear loudnorm | Backend/Voice |
| V11 | `GENERATE_TAKE` re-records every line per take (non-idempotent, voice differs between takes of one shot, GPU time wasted); `DIALOGUE_AUDIO` output is never used by takes | `take.ts:74-105` always calls `speakLine`; no lookup of `d.audioAssetId`; DB: `shots.dialogue` has 0/33 lines with `audioAssetId`, 17 orphan dialogue soundtracks | High | Takes must reuse `d.audioAssetId` when present and `setDialogueAudio` after recording; `PRODUCE` runs `DIALOGUE_AUDIO` first | Backend |
| V12 | WER check on Iraqi lines counts dialect spellings as errors (`اني`→`انا` = 0.125 on a 7-word line); long lines will cross 0.35 and be regenerated/flagged for nothing; Whisper transcribes toward MSA | `speech.ts:119-121,141-149` normalise orthography only; `qa_reports` show 0.13/0.14 on trivial proof lines | Medium | Dialect-aware normalisation table (اني/انا, شلون/كيف…), coverage metric (`scriptCoverage`) as the gate, WER as advisory; threshold per language | Voice |
| V13 | ASR failure is swallowed: `verifyLine` returns `null` (`voice.ts:79`); `DIALOGUE_AUDIO` then accepts the line unflagged (`:164` only acts when `check` is non-null); `VOICE_BUILD` marks `awaitingReview` but the identity is already pinned and selected | try/catch returning null; review has no effect on state | Medium | Treat `null` as a failed check (flag), surface `AWAITING_REVIEW` as a real gate (identity `status:'REVIEW'` until accepted) | Voice/Backend |
| A1 | `CHARACTER_APPEARANCE` silently ignores an unusable reference (sample picture, deleted asset) and still reports "from the producer's reference" | `images.ts:42` filters, `:80` message keyed on `pending` not on `refs.length`; no preflight before enqueue | Medium | Preflight at enqueue (`/api/jobs`): pending asset exists, kind IMAGE, not sample, ≥ 512 px; fail with `MISSING_REFERENCE` | Backend |
| A2 | Regenerating a portrait drops every reference view from the character (assets stay in the library as orphans) and leaves the character with `refs=[FACE]` until `CHARACTER_REFS` is run by hand; nothing chains the two | `images.ts:79` `keepExistingRefs:false`; `actions.ts:339` | Medium | `CHARACTER_APPEARANCE` enqueues `CHARACTER_REFS` as a child job (parentId); keep old refs tagged `superseded` instead of removing them | Backend |
| A3 | Manual "add view" accepts any image and makes it the portrait when none exists (`CharacterPage.tsx:123`) with no size/aspect check; `addCharacter` accepts any `sex`, `language`, `style`, NaN age from the API | `route.ts:11`; `actions.ts:310` checks name only; form defaults hide the gap | Medium | Server-side `CharacterInput` schema (section 3.1); image reference minimum 512×512 | Backend/Frontend |
| A4 | `Asset.unavailable` is documented as server-set (`types.ts:30-31`) but never persisted or computed: no `unavailable` column (`schema.ts:206-228`), `assetRow` omits it (`persist.ts:29`), `loadSnapshot` never stats files; `MEDIA_PROBE` marking is a no-op after the next load (`media-probe.ts:18`) | `/api/studio` returns 0 unavailable assets by construction; a deleted reference file surfaces only as an ffmpeg error inside a job | Medium | Add `unavailable boolean` column; set it in `MEDIA_PROBE` and in a periodic stat sweep; `referenceWav`/`draw` refuse unavailable assets with `MISSING_REFERENCE` | Backend |
| A5 | Deleting the uploaded voice reference of a used character is allowed; `identity.referenceAssetId` is left dangling | `rules.ts:69-71` protects portrait/refs only; `actions.ts:458` clears samples but not `identity.referenceAssetId` | Medium | Extend `protectedAssetOwner` to `identity.referenceAssetId` and the selected sample; clear/stale the identity on delete | Backend |
| S1 | Optimistic batch failure drops every command after the failed one without telling the user; a non-`StudioError` (TypeError from a malformed arg, e.g. `voice.samples` missing on an old row) becomes a 500 that the store treats as network trouble and retries forever with the same poison command (`connected=false`) | `store.tsx:110-114` (`void failed`, inflight cleared), `:116-122`; `engine.ts:37` rethrows; `http.ts:16` returns `INTERNAL` | High | On `ok:false`: re-queue commands after `failedAt`, surface which command failed; on 5xx with code `INTERNAL`: drop the batch and refresh (do not retry) | Frontend/Backend |
| S2 | No idempotency or active-job check for character jobs: double-click or two tabs enqueue two `VOICE_BUILD`/`CHARACTER_APPEARANCE` for the same character; `findActive` (`queue.ts:55`) is never used by `/api/jobs` | `CharacterPage.tsx:184,231` pass no `idempotencyKey`; `jobs/route.ts:18-23` | Medium | Server derives a key `${type}:${characterId}:${revision}` for character jobs and returns the active job | Backend |
| S3 | `DESIGN_CHARACTER` and `VOICE_BUILD` write 2–4 commands with separate `applyCommands` calls; a crash between them leaves a character outside its production/show cast, or an asset without its sample | `story.ts:73-75`, `voice.ts:112-113` | Low | Batch the commands into one `applyCommands([...])` call | Backend |
| S4 | `dialect` payload fields are free strings (`jobs.ts:73,97`); an unknown dialect reaches `pickEngine` and silently maps to indextts | `z.string()` instead of `z.enum(DIALECTS)` | Low | Use the vocabulary enums in job schemas | Backend |

Not reproduced in the live data (checked): dangling refs (24/24 ref assets exist), samples without assets, `usage.known=false`, identity without `referenceAssetId`, language mismatch between character and identity, failed character/voice jobs, reliability events for these job types (none). All four voices have `rev=1` and QA `ACCEPT`.

## 3. Proposed contracts

### 3.1 Character creation request (validated on the server, `POST /api/commands` → `createCharacter`)
```ts
export type CharacterCreateRequest =
  | { mode: 'MANUAL'; profile: CharacterProfileInput; voice?: VoiceProfileInput }
  | { mode: 'AUTO'; brief: string /* 2–2000 */; name?: string; style?: Style; language?: Language; dialect?: Dialect; productionId?: string; showId?: string }
  | { mode: 'REFERENCE'; profile: Partial<CharacterProfileInput> & Pick<CharacterProfileInput, 'name' | 'style' | 'language'>; referenceAssetId: string; drawNow?: boolean };

export interface CharacterProfileInput {
  name: string;                 // 1–80, trimmed, non-empty
  nameAr?: string;              // ≤ 80
  role: string;                 // ≤ 200
  style: Style; sex: Sex; species?: string; ageYears: number; // int 1–120
  build: string; face: string; hair: string; skin: string; eyes: string; wardrobe: string; personality: string; // each ≤ 400
  distinguishing: string[];     // ≤ 6 × 120
  language: Language; dialect?: Dialect; // dialect required iff language === 'AR'
  canon?: Character['canon']; notes?: string;
}
export interface VoiceProfileInput { pitch: 'LOW' | 'MID' | 'HIGH'; pace: 'SLOW' | 'MEASURED' | 'QUICK'; timbre?: string; notes?: string }
// zod: z.discriminatedUnion('mode', …); REFERENCE requires the asset to exist, kind IMAGE, !sample, min 512×512, origin UPLOAD.
// Result: { characterId, jobId?: string /* DESIGN_CHARACTER or CHARACTER_APPEARANCE when drawNow */ }
```

### 3.2 Voice reference upload (`POST /api/characters/:id/voice-reference`, multipart)
```ts
export interface VoiceReferenceValidation {
  durationSeconds: number;      // accept 3–30; trimmed window chosen at a silence boundary ≤ 12 s
  sampleRate: number;           // ≥ 16000 required; resampled to 24000 mono
  channels: number;             // any; downmixed
  integratedLufs: number;       // accept −30…−10 (ffmpeg loudnorm print_format=json, pass 1)
  truePeakDbtp: number;         // ≤ −1 after normalisation
  speech: { present: boolean; words: number; language: Language | 'UNKNOWN'; transcript: string; confidence: number }; // ASR pass, ≥ 3 words
  snrDb?: number; music?: boolean; // optional: refuse music/noise when detectable
}
export interface VoiceReferenceUpload { label?: string; transcript?: string /* producer-supplied, overrides ASR */; language?: Language; dialect?: Dialect }
export type VoiceReferenceResult =
  | { ok: true; sample: VoiceSample /* source 'UPLOADED', text filled, assetId of the ORIGINAL; trimmedAssetId of the 24 kHz window */; validation: VoiceReferenceValidation }
  | { ok: false; code: 'TOO_SHORT' | 'TOO_LONG' | 'NO_SPEECH' | 'TOO_QUIET' | 'CLIPPING' | 'WRONG_LANGUAGE' | 'BAD_FORMAT'; message: string; validation?: Partial<VoiceReferenceValidation> };
```

### 3.3 Voice creation modes and the identity record
```ts
export type VoiceBuildRequest =
  | { mode: 'REFERENCE'; characterId: string; referenceSampleId: string; provider?: 'LOCAL_TTS' | 'MINIMAX' }      // clone from a validated upload
  | { mode: 'AUTOMATIC'; characterId: string; provider?: 'LOCAL_TTS' | 'MINIMAX' }                                   // pick the best validated UPLOADED sample; refuse when none
  | { mode: 'MANUAL'; characterId: string; provider: 'MINIMAX'; providerVoiceId: string }                           // a catalogue voice, no reference
  // + idempotencyKey derived server-side: `VOICE_BUILD:${characterId}:${currentRevision}`

export interface VoiceIdentity {
  provider: 'LOCAL_TTS' | 'MINIMAX';
  model: 'indextts' | 'habibi' | string;      // primary engine
  fallbackModel?: 'indextts';                 // used for Latin-script tokens of a habibi voice (logged per line)
  mode: 'REFERENCE' | 'AUTOMATIC' | 'MANUAL';
  referenceSampleId?: string; referenceAssetId?: string; // ORIGINAL upload (never a GENERATED sample)
  referenceWindow?: { from: number; to: number; assetId: string }; // the trimmed 24 kHz clip actually sent to the engine
  referenceText?: string;                      // transcript used for conditioning (Habibi)
  providerVoiceId?: string;
  language: Language; dialect?: Dialect;
  params: { speed: number; emotionAlpha: number; seed?: number };
  proof: { sampleId: string; assetId: string; text: string; wer?: number; coverage?: number; heard?: string };
  status: 'ACTIVE' | 'REVIEW' | 'STALE';       // REVIEW: proof not verified; STALE: language/dialect/reference changed
  revision: number; createdAt: string; jobId: string;
}
// Rules: setVoiceIdentity is the only writer and requires `proof`; updateCharacter never touches voice.identity/samples/selectedSampleId;
// selectVoiceSample refuses GENERATED samples as identity; deleteAsset refuses identity.referenceAssetId of a used character.
```

## 4. Backend test plan

Unit (domain, `src/domain/*`):
- `addCharacter` rejects empty name, bad enums, age outside 1–120, dialect on EN; accepts REFERENCE mode only with an existing usable image.
- `updateCharacter` strips `voice.identity/samples/selectedSampleId`; language/dialect change with identity → `STALE` (unused) or `VOICE_LOCKED` (used).
- `setVoiceIdentity` requires `proof`; refuses when locked; revision increments once per success, never on failure.
- `selectVoiceSample` refuses GENERATED samples as identity; `deleteAsset` refuses the identity reference of a used character and clears/stales it otherwise.
- `referenceWav` candidate order: identity reference → validated UPLOADED → refuse GENERATED/SAMPLE (pure selection function extracted and tested).
- WER/coverage with Iraqi normalisation table (`اني/انا`, `شلون`), threshold behaviour at 0.35.
- Line language detection: AR, EN, mixed, numerals-only, empty.

API (`/api/commands`, `/api/jobs`, `/api/assets`):
- Per-command schema: malformed `addCharacter` args → 400 `INVALID`, never 500; batch with a failing 2nd command returns `failedAt=1` and the client re-queues command 3 (store test with MSW).
- Voice reference upload: 1 s clip → `TOO_SHORT`; 60 s → trimmed window ≤ 12 s at silence; silence → `NO_SPEECH`; −45 LUFS → `TOO_QUIET`; stereo 48 kHz mp3 → ok, 24 kHz mono stored; producer transcript kept.
- `/api/jobs` character jobs: second `VOICE_BUILD` for the same character while one is active → 200 with the existing job (`created:false`); `CHARACTER_APPEARANCE` with a deleted/sample pending reference → 400 `MISSING_REFERENCE`.
- `/api/studio`: an asset whose file is missing on disk is returned with `unavailable:true` after `MEDIA_PROBE`/sweep.

Worker (handlers with a fake TTS/ASR server and a fake ComfyUI):
- `VOICE_BUILD` failure in synthesis leaves the character byte-identical (no identity, no sample, no asset row); success writes identity + proof in one `applyCommands` batch.
- `VOICE_BUILD` never sets `selectedSampleId` to the proof line; `referenceWav` on the resulting character returns the upload.
- Habibi path sends `reference_text` from `VoiceSample.text` and performs **zero** `speech.transcribe` calls for the reference.
- Mixed-script line on a habibi identity: fallback recorded as a job event, `identity.model` unchanged.
- EN line for an AR identity in an EN production → engine chosen by line language; Habibi never receives Latin-only text.
- `GENERATE_TAKE` reuses `d.audioAssetId` when present and writes `setDialogueAudio` otherwise (dialogue coverage 33/33 after one PRODUCE); no new `soundtrack (dialogue)` asset for a shot already recorded.
- `verifyLine` ASR outage → line flagged and job `AWAITING_REVIEW`, identity `status:'REVIEW'`.
- `CHARACTER_APPEARANCE` with a usable reference passes it to `qwenEdit`; without one, the activity message says "from the description"; it enqueues `CHARACTER_REFS` as a child job.
- `DESIGN_CHARACTER`: character + castIds written in one batch; LLM output failing the schema → `INVALID`, no character created.
