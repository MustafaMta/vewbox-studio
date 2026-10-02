# Contract — persistent voice identity v2 (2026-10-03)

Sources: `docs/research/VOICE-IDENTITY-V2.md` (research), `docs/evidence/voice-design/report.json` (measured VoxCPM2
results), `docs/CONTRACTS-CHARACTER-VOICE.md` (wave-2 contract, still valid where not changed here), the producer's
direction: real voice creation, persistence and natural Iraqi Arabic pronunciation; "Do not claim that a voice is
verified without evaluating the generated audio"; no extra models or complexity without demonstrated benefit.

**One character = one canonical image + one persistent voice identity.**

## 1. Origins (fixed meaning, shown on every voice)

| Origin | What it is | May be a clone reference | Label |
|---|---|---|---|
| `UPLOAD_CONSENTED` | a real person's recording, uploaded or recorded in the browser, with the producer's consent statement | yes | "Recording — <label>" |
| `DESIGNED` | a studio-designed synthetic voice: VoxCPM2 from a text description only, its seed file's sha256 matching a design record (Rule V-DESIGN, research §2.3) | yes, the seed only (depth 1) | "Studio-designed synthetic voice — not a real person" |
| `HOSTED` | MiniMax system/design/clone voices | n/a | "MiniMax …" — NOT_CONFIGURED without a key, never a silent local substitute |
| `GENERATED` | any line spoken from a voice (proof, preview, dialogue) | **never** | "Generated line" |

Consent record for uploads: `{ statement: 'MY_VOICE' | 'SPEAKER_PERMISSION', by: 'PRODUCER', at }` — the upload/record UI
requires ticking one; the server refuses an upload without it (`CONSENT_REQUIRED`). Descriptions for designs are
refused if they name or imitate a real person (service deny-list + the existing check).

## 2. Modes

- **AUTOMATIC** (one click; also the creation flow's voice step):
  - **English, Arabic (MSA)**: design from the character profile — a deterministic description from sex, age, pitch,
    pace, timbre, personality (no LLM unless it measurably improves results) → `VOICE_DESIGN` (3 candidates speaking a
    calibration sentence in the character's language, each ≤ 11.5 s) → gates per candidate: CER ≤ 0.10 (EN) /
    ≤ 0.15 (AR), loudness and true peak within the existing reference gates, 0 clipped samples, duration ≤ 11.5 s →
    for each passing candidate, two preview sentences through the line engine (IndexTTS) and ECAPA(seed, rendering)
    averaged → pick the highest; record every number → `VOICE_BUILD` from the chosen seed (proof line, identity).
    MSA designs carry "Arabic accent not yet listener-verified".
  - **Iraqi Arabic**: cloned only from an Iraqi `UPLOAD_CONSENTED` recording (Habibi IRQ needs a reference in the
    dialect — research §2.5; the measured designed-seed experiment failed). Without one: refused with
    `MISSING_REFERENCE` and the sentence "Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12
    seconds of the voice." An experiment switch `allowDesignedIraqi` (Settings, default **off**) allows a designed
    Arabic seed → Habibi, always `dialectStatus: UNVERIFIED` and identity status REVIEW.
- **DESIGN** (manual): the producer writes or edits the description → `VOICE_DESIGN` → three candidates with players →
  the producer chooses one → `VOICE_BUILD { mode: 'DESIGN', designId, candidate }`.
- **REFERENCE**: upload or record in the browser (MediaRecorder → the existing voice-reference route) with consent →
  existing validation (duration, loudness, speech, language) → `VOICE_BUILD { mode: 'REFERENCE', referenceSampleId }`.
- **MANUAL (hosted)**: MiniMax catalogue — NOT_CONFIGURED here.
- **Preview**: `VOICE_PREVIEW` speaks any text with the pinned identity (exists).

## 3. Identity record additions (append-only, `VoiceIdentity`)

`origin`, `designId` + `seedSha256` (DESIGNED), `consent` (UPLOAD_CONSENTED), `dialectStatus: 'NOT_APPLICABLE' |
'UNVERIFIED' | 'LISTENER_APPROVED' | 'LISTENER_REJECTED'`, `evaluation: { cer, coverage, lufs, truePeakDbtp, clipped,
seedToLineSimilarity?, measuredAt }`, `listening: Array<{ by: 'PRODUCER', natural: 1–5, dialectAuthentic?: boolean,
note?, at }>`. Design records (`VOICE_DESIGN` results): description, engine version, seeds, candidates with sha256,
measurements, chosen index — persisted (a table or jsonb) and their files kept (same seed ≠ same bytes).

## 4. Evaluation — measured vs listened

- Measured on every proof/preview/candidate and shown with its numbers: CER and word coverage against the intended
  text (Iraqi folded by `normalizeIraqi`), loudness, true peak, clipping, seed-to-line similarity.
- **Arabic word coverage must not count spacing differences as missing words** (the transcriber writes «گلتلك» as
  «قلت لك»): compute coverage on a space-insensitive alignment for Arabic, proven by tests that it still counts a
  wrong word (e.g. «باچر» heard «باسر») as wrong.
- **Listening is recorded, never inferred**: the profile's voice section offers "I listened" (naturalness 1–5; for
  Iraqi: "sounds authentically Iraqi?" yes/no). `dialectStatus` becomes LISTENER_APPROVED only from a listener's
  record. No UI text calls a voice natural or Iraqi without it; ASR success is shown as "intelligible (measured)".

## 5. Lock

Unchanged: once a character has spoken in a video the identity (and its reference) is locked server-side
(`VOICE_LOCKED`); previews and listening records stay allowed.

## 6. Acceptance (browser, real audio)

English automatic voice (designed), Arabic MSA automatic voice (designed), manual design with three candidates and a
choice, a reference voice from an uploaded recording, Iraqi: (a) refusal without an Iraqi recording, (b) the
experiment switch path measured, (c) an Iraqi recording path when an authorised recording exists; previews play in
the profile; identity persists across a restart; lock refuses a rebuild after use. Every claim backed by measured
numbers in the UI and evidence files; naturalness and dialect marked pending a listener.
