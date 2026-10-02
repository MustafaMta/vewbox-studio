# Wave 2 — independent technical review (Agent 8)

Reviewed on 2026-10-02 against `main` at `6f48cf6` (Backend `2d1b1b6`, Frontend `574a28e`, Voice `758f0d1`, Image `47131be`, QA `402ff2a`
merged). Method: code reading with call-path tracing; `pnpm exec tsc --noEmit -p tsconfig.json` (exit 0) and `pnpm exec vitest run`
(26 files, 188 tests, all passing). No GPU job, browser, database reset or service restart was run; nothing outside this file was
modified. Governing texts: `docs/CONTRACTS-CHARACTER-VOICE.md` (quoted as §x.y), the five research reports, `docs/STUDIO-ARCHITECTURE.md`.

Working-tree note: `main` carries two **uncommitted** modifications. `src/components/character/AppearanceTab.tsx` (the `viewOf`
fix, finding 1 — required) and `src/server/story/engine.ts` (duplicate-location de-dupe in proposals — unrelated to wave 2, not
reviewed for correctness). The committed HEAD is what this review judges unless stated.

## Verdicts

| Area | Verdict | Why (one line) |
|---|---|---|
| A. `CREATE_CHARACTER` orchestrator (AUTO / MANUAL / REFERENCE) | ACCEPT WITH FIXES | Chain, keys, partial-success record and restart adoption are right; REFERENCE mode designs blind to the picture (3); generic retry cannot progress (12); holds a CPU slot for the whole chain (10). |
| B. Reference-image validation (§1.2) | REJECT | Not implemented at upload: `/api/assets` ignores `purpose`, never returns or stores `validation`; the orchestrator reads a field nobody writes; journey 03 fails deterministically (2). The honesty rule itself holds because the GPU job re-checks on the CPU before drawing. |
| C. Appearance regeneration and identity sheet (Image) | ACCEPT WITH FIXES | Sheet / tiles / fixed references / seed / provenance are as specified; on committed HEAD the Appearance tab cannot place a single sheet tile (1); `MISSING_REFERENCE` from `images.ts` is mis-classified (13). |
| D. Voice identity build and voice-reference validation (Backend) | ACCEPT WITH FIXES | Reference rule, proof-before-identity batch, REVIEW on outage are correct and tested; the CER gate the contract requires is not applied (4); the Voice tab's own idempotency key makes "Build the voice" a no-op after any failure (6); engine-tagged synthetic audio is accepted as an upload (7). |
| E. Iraqi Arabic routing and metrics (Voice + Backend) | ACCEPT WITH FIXES | Habibi for Arabic script / IndexTTS for Latin and mixed is implemented and logged; but there are two different `routeLine`/`lineScript` implementations, the worker uses one and the suite the other (5); `voice-check.ts` is dead code in the application (9). |
| F. Locks (`rules.ts`, actions, server guards) | ACCEPT WITH FIXES | Appearance lock is enforced everywhere it matters; the voice lock has one bypass: a used character whose voice is only a *selected sample* can have an identity built from a different upload (8). |
| G. Hidden fallbacks, forbidden engines, fabricated UI | ACCEPT | No video engine but MiniMax (local H3 / hosted), no LatentSync or lip-sync code in `src/`; skills are read, never executed; the one dead control is the "Studio voice" option (15). |
| H. Security | ACCEPT | Magic-byte sniffing with an allow-list, SVG refused, ids and library paths guarded, all subprocesses argv-based, pino redaction, no key logging found. Notes: whole-file buffering under a 2 GB cap (18), dev-script `shell: true` (22). |
| I. Reliability | ACCEPT WITH FIXES | Retry classes and lease/reclaim are sound; findings 6, 10, 12, 13. |
| J. Frontend ↔ backend contract | ACCEPT WITH FIXES | Payload/result shapes and `VoiceReferenceResult` match; all 305 static i18n keys resolve in both locales; dynamic `jp.*` phase keys are missing (14); `view` vs `role` resolved only in the uncommitted diff (1). |
| K. Tests vs. checklist claims | ACCEPT WITH FIXES | Unit coverage of the pure logic is genuinely good; the orchestrator test cannot exercise polling/adoption of *running* children; parity is tested on two different functions; journey 03 contradicts the implementation and journey 06 violates §1.5 by design (see §Test adequacy). |

## Findings (by severity)

### Blocker

**1. On committed HEAD the Appearance tab places no identity-sheet tile; the fix exists only as an uncommitted edit.**
`src/worker/handlers/images.ts:191,195` write `view: 'FACE'` and `view: 'SHEET_TILE'` on the refs (provenance, per the comment in
`src/domain/types.ts:315-318`). HEAD's `src/components/character/AppearanceTab.tsx` resolves a tile by `(r as { view?: string }).view ?? r.role`,
so `sheet.find(viewOf(r) === 'FRONT')` (`AppearanceTab.tsx:82`) never matches a generated tile; the four tiles fall into `others`
(`:83`) under "Views and outfits" labelled "Sheet tile", every sheet slot shows "not drawn" and "Redraw this view" reads "Draw".
The working-tree diff (`viewOf = (r) => r.role`, `AppearanceTab.tsx:25-27`) corrects it. **Fix:** commit that diff; add a unit test that
maps `{ role: 'FRONT', view: 'SHEET_TILE' }` to the FRONT slot so the two meanings cannot drift again. (The `view` field's double
meaning — "provenance" in the Image branch, "the view" in UX docs and journey 04 `:69` — deserves a rename to `drawnAs`.)

### Major

**2. §1.2 reference-image validation is not performed at upload; the orchestrator reads a value nobody writes; journey 03 fails.**
`src/app/api/assets/route.ts:13-27` reads `file`, `label`, `tags`, `expect` only — no `purpose`, no `validateReferenceImage`, response
`{ asset }`. `src/studio/api.ts:53-59` sends `purpose: 'character-reference'` and types `validation?` as optional, so the browser
shows nothing (`PictureStart.tsx:47,61-66`, `AppearanceTab.tsx:62` never trigger). `src/worker/handlers/character.ts:59` reads
`refAsset.provenance.validation` (never written), so `referenceImageProblem` checks only size/sample/SVG/unavailable, and
`setPendingReference(c.id, refAsset.id, undefined)` (`:105-107`) stores no validation. Blur (and, when a detector exists, faces) are
checked only inside the GPU job (`images.ts:107-114`), i.e. after the producer has queued and waited. `tests/e2e/journeys/03-reference-creation.spec.ts:19`
(`r1.validation?.ok` → `undefined.toBe(false)`), `:23-28` and `:46-48` fail against this server without any GPU. **Fix:** in the
assets route, when `purpose === 'character-reference'` (or `expect === 'IMAGE'` and the tag), run `validateReferenceImage(stored.absPath)`
on the CPU, return `{ asset, validation }` and store it in `provenance.validation`; the orchestrator and `setPendingReference` already
pass it through. Spec `03:28` must accept `faces === undefined` together with the `FACE_DETECTION_NOTE` reason, because the contract
explicitly allows "size + sharpness only" — a number there cannot be produced honestly today (`image-check.ts:97,101`).

**3. REFERENCE mode: the written sheet, and therefore the persisted identity line, is invented without seeing the picture.**
For From-a-picture the payload profile holds only name/role/style/language (`CreateCharacter.tsx:136`), so `profileNeedsDesign` is true
and `DESIGN_CHARACTER` runs first (`character.ts:67-70`). The design prompt (`src/server/story/engine.ts:180`) has no image input; the
only hint is the brief sentence "Keep the face from the reference picture…" (`i18n.ts:1075`), after which the model must still fill
hair/skin/eyes/wardrobe (`story.ts:85-91`). The portrait prompt then joins that invented description, the identity line built from it
(`src/server/workflows/identity.ts:21-25`) and "Keep the face, hair and identity of the person in the reference picture exactly"
(`images.ts:130`) — two conflicting conditionings in one prompt, which `CHARACTER-IMAGE-STACK.md` §4 names as the drift root cause.
Worse, `images.ts:135` persists that invented `identityLine` into `canon`, and every later sheet/view/frame repeats it verbatim.
**Fix (this wave):** in REFERENCE mode draw the portrait before design, with a neutral prompt (view sentence + direction + "keep the
person in the reference"), then run the design step with the portrait as the source of the look fields (a vision pass through
`story.structured_answer` or, until one exists, leave hair/skin/eyes/wardrobe as "as in the reference" tokens and exclude them from
`identityLine`). At minimum, omit the invented look tokens from the portrait prompt and from `canon.identityLine` when a pending
reference exists, and say so in the step result.

**4. The CER gate required by §1.4 is not applied; `proof.cer` is never recorded.**
`src/worker/handlers/voice.ts:36-39` still says CER "joins the gate when the Voice agent's metric lands" — it has landed
(`src/server/providers/speech.ts:271-294`: `charErrorRate`, `VOICE_GATES`, `verdict`) and nothing imports it (grep: zero call sites in
`src/`). `verifyLine` (`voice.ts:181-187`) gates on coverage alone; the identity proof (`voice.ts:249`) carries `wer`/`coverage` and no
`cer`; the Voice tab shows CER as "—" (`VoiceTab.tsx:103`). An Iraqi line heard with the right words in the wrong order of
orthography passes; one with the right letters but a dropped function word is flagged — the inverse of what the contract decided.
**Fix:** `LineCheck` gains `cer` and `verdict`; `verifyLine` returns `verdict({ coverage, cer, context })` and `ok = status === 'PASS'`,
`status === 'FAIL'` triggers the single regeneration in `take.ts:110` / `voice.ts:322`; `proof.cer` written; QA report rows for CER.

**5. Two routing implementations with different semantics; the worker uses one, the suite and half the parity tests the other.**
`voice.ts:47-74` (`lineScript`/`routeLine`, used by `take.ts:17`, `voice.ts:158`) and `speech.ts:59-81` (used by
`scripts/iraqi-voice-suite.mjs` and `tests/unit/voice-metrics.test.ts:70-95`) disagree: `voice.ts:48` matches the whole Arabic block
including Arabic punctuation and digits, so `"Hello، world"` (Arabic comma) is MIXED in the worker (IndexTTS, verified in **Arabic**,
coverage 0, flagged) and LATIN in `speech.ts` (verified in English); `speech.ts` has NUMERIC/EMPTY classes and treats any non-Latin
non-Arabic script as LATIN, `voice.ts` returns NONE. "Routing parity … identical in `voice.ts`, `take.ts` and the suite" (§1.4) is
therefore not true, and the suite's evidence will not reproduce the worker's choices. **Fix:** delete the copy in `voice.ts`; make
`routeLine(c, text)` a thin adapter over `speech.routeLine(text, c.language, c.dialect, pinned)` that adds the pinned-model rule and
the fallback message; keep one parity test.

**6. After any failed build, "Build the voice" on the Voice tab silently returns the failed job.**
`VoiceTab.tsx:185` sends `idempotencyKey: VOICE_BUILD:${id}:${rev + 1}`. `queue.ts:47-52` hands back the existing FAILED row
(`created: false`); the route's "terminal match → fresh key" rule (`src/app/api/jobs/route.ts:47`) applies only when the client sent
no key, so nothing is queued and the button gives no feedback (the only working path is the small "retry" under the failure notice).
The contract put key derivation on the server (§1.4). **Fix:** drop the client key (the server derives
`VOICE_BUILD:${characterId}:${revision}` at `route.ts:35`), and apply the fresh-key rule to every terminal match of a `VOICE_BUILD:` key
regardless of who supplied it; `store.startJob` should surface `created: false` with the existing job's status.

**7. Engine-generated audio re-uploaded as a "recording" is accepted as a clone source; the tag written to prevent this is never read.**
`docker/tts/app.py:393-397` stamps every synthesised WAV (`ISFT = vewbox-tts …`, `ICMT = synthetic speech; … not a voice reference`)
"so that a generated line can never pass for a recording". No code in `src/server` reads `encoder`/`comment` tags (grep). The upload
route (`voice-reference/route.ts:50-69`) stores it as `source: 'UPLOADED'`, selects it, and `pickReference` clones from it. Journey 06
(`06-iraqi-voice.spec.ts:14-17`) does exactly this with a synthetic Arabic clip, so the suite would pass while §1.5 is violated.
**Fix:** `measureVoiceReference` (or `storeBuffer` for `expectKind: 'AUDIO'`) reads the probe's format tags and refuses
`BAD_FORMAT` ("this file is engine output, not a recording") when `encoder`/`comment` contain `vewbox-tts` or `not a voice reference`;
journey 06 is then an *expected refusal* until an authorised human recording exists, as `docs/evidence/iraqi-suite-phase2-plan.md` already says.

**8. Voice-lock bypass: a used character whose voice is only a selected sample can be re-voiced from another upload.**
`rules.ts:54-58` locks when `identity || selectedSampleId`; but `preflight.ts:125` (`!(lock.locked && c.voice.identity)`),
`voice.ts:204` (`if (c.voice.identity) guardVoiceChange`) and `actions.ts:437` guard only when an identity exists. In REFERENCE mode the
handler clones from any `referenceSampleId` (`voice.ts:212`), pins it, and `lineRecordingCurrent` (`voice.ts:292-298`) then treats
every stored line (recorded with `voiceRevision: undefined`) as stale, so the next take re-records the character in the new voice.
The rule's own comment ("a character who reached their first video with no voice at all may still be given one") is narrower than
what the code allows. **Fix:** when `voiceLock(c).locked && !c.voice.identity`, accept a build only if the reference resolves to the
selected sample's asset (REFERENCE: `referenceSampleId === selectedSampleId`; AUTOMATIC: force `pickReference` to the selected
sample); otherwise `VOICE_LOCKED`. Apply in preflight, handler and `setVoiceIdentity`.

**9. The Voice agent's `src/server/media/voice-check.ts` is dead in the application; two measurement stacks exist.**
Only `scripts/iraqi-voice-suite.mjs:35` and `tests/unit/voice-metrics-reference.test.ts:7` import it. The route and the handlers use the
Backend's `src/server/studio/voice-reference.ts` (`voice-reference/route.ts:11`, `voice.ts:13`) whose `trimReference` (`:98-107`) and
`judgeFormat` (`:21-31`) differ from `voice-check.ts:119-127` / `:131-154` (no ±40 dB clamp; CLIPPING judged on true peak > −0.1 dBTP
rather than counted clipped samples — a clean recording normalised to 0 dBFS is refused as "clips"). Two exported types are both
named `VoiceReferenceValidation` with different shapes (`types.ts:372` vs `voice-check.ts:23`). Checklist 16.2 marks `voice-check.ts`
"VERIFIED (unit + service)", which is true of the module and misleading about the product. **Fix:** route and handlers call
`validateVoiceReference`/`trimReference` from `voice-check.ts` for format, level, clipping and window, keep the ASR/speech judgement in
`voice-reference.ts`, delete the duplicate helpers, keep one type.

**10. `CREATE_CHARACTER` holds a CPU-lane slot (default concurrency 2) for the whole chain, with no timeout.**
`jobs.ts:150` puts it in the CPU lane; `worker/index.ts:32-36` with `env.ts:47` (`WORKER_CONCURRENCY_CPU = 2`); `character.ts:30-36`
polls children every 3 s for as long as the GPU queue takes (sheet ≈ minutes, VOICE_BUILD behind it). Two creations started together
block `ASSEMBLE`, `EXPORT` and `MEDIA_PROBE` for the duration; the casting-director's `limits.timeoutMs` (`model.ts:152`) is not
enforced anywhere. **Fix:** a separate `ORCHESTRATION` resource/lane (also for `PRODUCE`) or a `runAfter` re-queue instead of an
in-process wait; a wall-clock bound that fails the parent with `INFRASTRUCTURE` and the children's ids in `details`.

**11. MiniMax cloning is fed the trimmed ≤ 12 s window although the hosted clone needs 10 s – 5 min.**
`voice.ts:227` passes `ref.file` (the `REFERENCE_WINDOW` cut, `voice-reference.ts:15`, typically 3–12 s) to `minimax.cloneVoice`
(`minimax.ts:179`). With `voiceProvider: 'MINIMAX'` configured, most builds will fail at the provider with a message that blames the
file. Not reachable on this machine (no key), which is why it is Major rather than Blocker. **Fix:** send the original upload
(`assetFile(ref.asset)`) and refuse up front with `INVALID_INPUT` when the original is under 10 s.

### Minor

**12. Retrying a failed `CREATE_CHARACTER` through `/api/jobs/{id}/retry` cannot make progress.** `runStep` adopts the child under
`create:${jobId}:${step}` (`character.ts:27`); a FAILED/CANCELLED child is terminal and is returned as such (`:32`), so the new attempt
re-reports the same failure. The page avoids it by launching a new parent (`CreateCharacter.tsx:143,198`), but the generic retry on
the Production page does not. **Fix:** when `!r.created` and the adopted child is FAILED/CANCELLED, call `retry(r.job.id)` before polling.

**13. `MISSING_REFERENCE` thrown by `images.ts` is not a `StudioErrorCode` and is mis-classified.** `images.ts:38` casts the string;
`errors.ts:2-11` has no such code (`httpStatusFor` would return `undefined`); the thrown errors (`:109,112`) carry no `failureClass`,
so `classifyFailure` (`runs.ts:18-45`) returns `UNKNOWN` for "the reference picture cannot be used — blurry…" (only the "is missing"
wording matches a regex). Reliability events and the "Needs your decision" copy then say UNKNOWN; the UI copy still works because it
keys on `error.code`. **Fix:** use the `missingReference()` helper pattern from `voice.ts:42` / `character.ts:22` (`INVALID` +
`failureClass: 'MISSING_REFERENCE'` in details and on the error).

**14. Dynamic phase keys `jp.<phase>` do not exist, so phase chips fall back to English on the Arabic locale.** `VoiceTab.tsx:189`
(`T.dyn(\`jp.${phase}\`)`) with phases `preparing`, `cloning`, `speaking`, `drawing`, `recording`, `design`, `recovering`; `i18n.ts:992-997`
defines only `jp.phases/elapsed/step/done/failed/skipped`; `tt` (`i18n.ts:1236-1239`) humanises the key in English. All 305 static keys
used by the character UI resolve in both locales (checked by script). **Fix:** add the phase keys (both locales) or map phases through
`JOB_LABELS`-style tables.

**15. The "Studio voice" option on the Describe start can never produce a voice.** `DescribeStart.tsx:37` offers AUTOMATIC with the
hint "Picks the best matching recording the studio has" (`i18n.ts:1056-1058`); AUTOMATIC preflight is per character
(`preflight.ts:130-132`) and a character being created has no uploads, so the step is always skipped (`character.ts:135-139`). The
skip is honest, but the control promises a capability the studio states it lacks (`voice.chooseStudio.none`). **Fix:** remove the option
until a voice bank exists, or label it "after you add a recording".

**16. Orphaned upload on a non-provider `StudioError` inside the voice-reference route.** `voice-reference/route.ts:73-77` removes the
stored original only for non-StudioErrors and `UNAVAILABLE|PROVIDER|NOT_CONFIGURED`; an `INVALID`/`NOT_FOUND`/`CONFLICT` thrown by
`adoptFile` or the command batch after `storeBuffer` leaves a file in the library with no asset row. **Fix:** remove the file on every
throw (the success path has already returned).

**17. Habibi silently transcribes the reference inside the engine when the studio's ASR failed.** `voice.ts:143-151` sets
`ref.text = ''` on an outage; `app.py:307-308` then lets F5 run its own Whisper. The identity is pinned with `referenceText: undefined`
and every later line re-transcribes nondeterministically — defect "Habibi reference text recomputed" of the diagnosis, now only on the
outage path. **Fix:** on ASR failure in a Habibi build, pin `status: 'REVIEW'` and record the reason, or refuse `UNAVAILABLE`.

**18. Whole-file buffering under a 2 GB cap on both upload routes.** `env.ts:18` (`MAX_UPLOAD_MB` default 2048), `assets/route.ts:21`,
`voice-reference/route.ts:48` call `file.arrayBuffer()` before `storeBuffer` checks the size (`media.ts:117-120`). Single-user local
deployment, so Minor. **Fix:** a per-route cap (voice reference ≤ 50 MB, reference picture ≤ 25 MB) checked on `file.size` first.

**19. Parent `CREATE_CHARACTER` is accepted without any idempotency key.** `CreateCharacter.tsx:115` / `contract.ts:44` send none;
`enqueue` has no `ONE_PER_*` guard for it. A double submit (two tabs, a retried request after a timeout) creates two characters.
**Fix:** derive `CREATE_CHARACTER:${sha(payload)}:${minute}` on the client or refuse a second active parent with the same name+mode.

**20. `measureVoiceReference` has a dead conditional and a mis-ordered CLIPPING test.** `voice-reference.ts:129` evaluates to `detected`
on both branches (the confidence threshold has no effect there; `judgeSpeech` re-applies it, so no functional bug). `judgeFormat:28-29`
reports "too hot (LUFS)" as CLIPPING — the contract's codes have no better fit, but the message should not say "clips".

**21. The FACE crop is listed under "Views and outfits".** `AppearanceTab.tsx:83,158` — `others` collects every ref not in
`SHEET_VIEWS`, which includes `FACE`. Show it beside the portrait as "face crop (the sheet's second reference)" or hide it.

### Nit

**22. `scripts/qa-journeys.mjs:57` spawns with `shell: true` on Windows and forwards `--grep` and trailing args verbatim** — a dev-only
script, but quoting a regex with `&` or `|` runs it through `cmd.exe`. Use `spawnSync('pnpm.cmd', …, { shell: false })` with
`windowsHide` or resolve the binary path.

**23. `character.ts:76` rethrows the design child's error code cast to `StudioError['code']`** — a child code outside the union (for
example a provider's own string) becomes the parent's `code` unchanged; map unknown codes to `PROVIDER`.

**24. `JobProgress.percent: null` is set explicitly everywhere in the orchestrator** — consistent with "never invented", fine; the
`JobProgress` doc comment could say `null` is the deliberate "unknowable" marker so nobody "fixes" it.

## What holds up (verified by reading, worth stating)

- The reference rule (§1.4) is enforced at three layers: `pickReference` (`voice.ts:86-106`), `preflightCharacter` (`preflight.ts:122-136`),
  `setVoiceIdentity` (`actions.ts:441-449`), with `isCloneSource` (`rules.ts:90`) and `usableAudio` refusing GENERATED/SAMPLE/unavailable.
- Identity and proof are written in one batch after the audio exists (`voice.ts:251-257`), the proof sample is never selected
  (`actions.ts:453`), a failed batch removes the file (`:257`); `updateCharacter` strips `identity/samples/selectedSampleId` and marks
  STALE or refuses `VOICE_LOCKED` on a language/dialect change (`actions.ts:349-366`); `deleteAsset` protects the reference and window
  of a used character (`rules.ts:75-83`, `actions.ts:539-540`).
- Routing: Arabic script → the pinned Arabic engine (`voice.ts:68-70`), Latin → IndexTTS with an event naming the fallback
  (`:71,170`), the identity `model` is never rewritten. ASR outage → REVIEW, never a silent pass (`verifyLine`, `voiceBuild:242`).
- `CREATE_CHARACTER`: `step/total` only over real phases, children with `parentId` and `create:${jobId}:${step}` keys
  (`character.ts:27`), MANUAL record written under a deterministic seed so a restart adopts it (`:88-91`), partial success recorded per
  step with `failureClass` (`:39-41,147-150`), `AWAITING_REVIEW` when anything failed (`:150`).
- Worker retry policy: only `INFRASTRUCTURE|PROVIDER|RESOURCE_EXHAUSTION` and only for `PROVIDER|UNAVAILABLE` codes
  (`worker/index.ts:91`); every failure is a reliability event; stale leases are reclaimed after 90 s and the orphaned run closed
  (`queue.ts:146-167`, `runs.ts:61`).
- Uploads: `file-type` sniffing on bytes, allow-list, SVG refused by content and by declared type (`media.ts:61-76`), `assertSafeId`
  and root-bounded path resolution (`:29-55`); ffmpeg/ffprobe via `spawn`/`execFile` argv only; `pino` redaction of key/token paths
  (`log.ts:11`); MiniMax auth header built from env, never logged (`minimax.ts:43,53,60`).
- `docker/tts/app.py`: look-ahead limiter + true-peak trim, seeds for both engines, parameters echoed in `x-params`, engine version
  in headers and `/health`, synthetic-provenance tag in the WAV (read by nobody — finding 7).
- Frontend honesty: the result frame shows a picture only when `portrait.origin === 'GENERATED'` (`AppearanceTab.tsx:49,97`); the
  stepper never invents a percentage (`preflight.ts:91-135`); the "just created" banner and the lock notices use the real
  `appearanceLock`/`voiceLock` (`CharacterPage.tsx:36-37`).

## Test adequacy vs. the checklist

- `tests/unit/create-character.test.ts` runs the real reducers under a fake queue whose children **finish synchronously inside
  `enqueue`** (`:25-38`). It proves keys, parent ids, the MANUAL batch, restart adoption of *terminal* children, REFERENCE refusal and the
  partial-success record. It cannot prove the polling loop, adoption of a *running* child after a worker restart, cancellation while
  waiting, or the `AWAITING_REVIEW` child path — exactly the behaviours §1.1 calls out ("a restart adopts in-flight children").
- `tests/unit/voice-build.test.ts` (real reducers, mocked synth/ASR/ffmpeg) is strong on batch atomicity, the reference order, Habibi
  reference text, REVIEW on outage and DIALOGUE_AUDIO reuse. The MiniMax path is mocked to throw ("unused"), so finding 11 is untested.
- Parity is tested twice on two different functions: `voice-metrics.test.ts:70-95` on `speech.routeLine` (not used by the worker),
  `voice-build.test.ts:62-83` on `voice.routeLine`. Both pass; the divergence in finding 5 is in neither.
- `tests/worker/voice-reference.test.ts` exercises `measureVoiceReference` with real ffmpeg and a fake ASR — good. There is no test of
  the HTTP route itself (`storeBuffer` → measure → batch → response), nor of `/api/assets` with `purpose`.
- `tests/unit/character-voice.test.ts` covers the zod command schemas, the `updateCharacter` strip/STALE/VOICE_LOCKED rules and
  `deleteAsset` protection; `voice-lock.test.ts:31` encodes the narrow exception that finding 8 shows is wider in the code.
- Journeys (`tests/e2e/journeys`): 01, 03 (second), 04–08 (first) are `@gpu` and have not run (checklist 16.4 says so, honestly).
  Of the non-GPU ones, 03 (first) fails deterministically (finding 2); 08 (second) and 09 (second) are sound API/psql checks; 10 is a
  rendering walk. 06 is built on a synthetic reference and would pass through a route that cannot tell (finding 7). 09's restart
  test needs an operator and `var/qa-restarted.flag` — not automatable here, correctly flagged.
- `docs/IMPLEMENTATION-CHECKLIST.md`: rows 16.1–16.4 cover research, Voice, Image and QA. There is **no row** for the Backend merge
  (`2d1b1b6`: orchestrator, voice contract, upload route) or the Frontend merge (`574a28e`), so their status is nowhere recorded; 16.2's
  "VERIFIED (unit + service)" for `voice-check.ts` is true of the module and not of its use (finding 9); 16.3's "reference-image
  validation" is implemented inside the GPU job only (finding 2).

## Not verifiable without GPU, browser or operator action

- Any generated output: identity-sheet coherence, the Multiple-Angles LoRA effect, Habibi/IndexTTS audio, the limiter's audible
  result, real coverage/CER numbers on Iraqi speech, Whisper's language detection on Iraqi references (WRONG_LANGUAGE false positives).
- Restart adoption of children that are *running* when the worker dies (only the terminal case is unit-tested).
- Browser behaviour: the four-step stepper live, RTL at phone width, `measureAudio` on streaming containers, `useUnsavedGuard`.
- That `drizzle/0003_assets_unavailable.sql` has been applied to the live database and that `MEDIA_PROBE`/the sweep set `unavailable`.
- MiniMax hosted paths (no key on this machine): clone, catalogue voice, `languageBoost`.
- ComfyUI node/model availability (`requireComfy`) and the live `/api/status` gates the creation page reads.
